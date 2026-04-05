const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// 1. Helper function to calculate distance using Haversine formula
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad;
    const dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // inside in meters
}

// 2. Create the Geofence around the strict Pin (Run by Dispatch / Facility)
exports.createGeofence = functions.https.onCall(async (data, context) => {
    // if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');

    const { latitude, longitude, address, radius = 50 } = data;

    if (!latitude || !longitude) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing coordinates.');
    }

    // Save the geofence to Firestore
    const dropoffRef = await db.collection('dropoffs').add({
        address,
        geofence: {
            latitude,
            longitude,
            radius: radius // standard is 50m
        },
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: context.auth ? context.auth.uid : 'anon'
    });

    return { success: true, dropoffId: dropoffRef.id };
});

// 3. Driver triggers 'Package Delivered' validation
exports.triggerDelivery = functions.https.onCall(async (data, context) => {
    const { dropoffId, driverLatitude, driverLongitude } = data;

    if (!dropoffId || !driverLatitude || !driverLongitude) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing data.');
    }

    const dropoffDoc = await db.collection('dropoffs').doc(dropoffId).get();

    if (!dropoffDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Dropoff not found.');
    }

    const dropoffData = dropoffDoc.data();
    const { latitude, longitude, radius } = dropoffData.geofence;

    // Calculate distance between driver and the strict center pin
    const distance = getDistance(latitude, longitude, driverLatitude, driverLongitude);

    // If driver is outside the 50m radius fence
    if (distance > radius) {
        throw new functions.https.HttpsError(
            'failed-precondition',
            `Delivery failed. You are ${Math.round(distance)}m away. You must be within ${radius}m of the building entrance highlight.`
        );
    }

    // Success: Update state to delivered
    await db.collection('dropoffs').doc(dropoffId).update({
        status: 'delivered',
        deliveredAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: 'Package marked as delivered.' };
});
