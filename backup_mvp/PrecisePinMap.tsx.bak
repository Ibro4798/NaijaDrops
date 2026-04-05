import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions, ActivityIndicator } from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import Geolocation from 'react-native-geolocation-service';
import Toast from 'react-native-toast-message';

// Initialize Mapbox with your access token
MapboxGL.setAccessToken('YOUR_MAPBOX_ACCESS_TOKEN');

const { width, height } = Dimensions.get('window');

const PrecisePinMap = () => {
    const [coordinates, setCoordinates] = useState([-122.4324, 37.78825]); // Default location
    const [address, setAddress] = useState('Move map to set pin');
    const [accuracy, setAccuracy] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [isConfirming, setIsConfirming] = useState(false);

    const mapRef = useRef(null);
    const cameraRef = useRef(null);

    useEffect(() => {
        // Request permissions and get initial high-accuracy location
        requestLocationPermission();
    }, []);

    const requestLocationPermission = async () => {
        Geolocation.getCurrentPosition(
            (position) => {
                const { longitude, latitude, accuracy } = position.coords;
                setCoordinates([longitude, latitude]);
                setAccuracy(accuracy);
                setIsLoading(false);
                checkAccuracy(accuracy);
            },
            (error) => {
                setIsLoading(false);
                Toast.show({ type: 'error', text1: 'Location error', text2: error.message });
            },
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
        );
    };

    const checkAccuracy = (acc) => {
        if (acc > 10) {
            Toast.show({
                type: 'info',
                text1: 'Low GPS Accuracy',
                text2: 'Please move closer to a window or open space for a better pin.',
                position: 'bottom',
                visibilityTime: 4000,
            });
        }
    };

    const onRegionDidChange = async (event) => {
        const newCoords = event.geometry.coordinates;
        setCoordinates(newCoords);

        // Simulate reverse geocoding & snap-to-geometry for building entrance
        // In production, use Mapbox Geocoding API / Mapbox Search SDK
        setAddress('Snapping to nearest building entrance...');

        setTimeout(() => {
            // Mock result of snapping to building entrance
            setAddress('Main Entrance, 123 Logistics Blvd');
        }, 600);
    };

    const handleConfirmLocation = async () => {
        if (accuracy > 10) {
            Toast.show({
                type: 'error',
                text1: 'Cannot Confirm',
                text2: 'GPS variance is too high. Find a more open space.',
            });
            return;
        }

        setIsConfirming(true);

        try {
            const response = await fetch('YOUR_FIREBASE_FUNCTION_URL/createGeofence', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    latitude: coordinates[1],
                    longitude: coordinates[0],
                    address: address,
                    radius: 50 // meters
                })
            });

            const result = await response.json();

            if (response.ok) {
                Toast.show({ type: 'success', text1: 'Location Confirmed', text2: '50m Delivery Geofence created.' });
            } else {
                throw new Error(result.error);
            }
        } catch (error) {
            Toast.show({ type: 'error', text1: 'Error saving location', text2: error.message });
        } finally {
            setIsConfirming(false);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.center}>
                <ActivityIndicator size="large" color="#4f46e5" />
                <Text style={{ marginTop: 10 }}>Acquiring precise location...</Text>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <MapboxGL.MapView
                ref={mapRef}
                style={styles.map}
                onRegionDidChange={onRegionDidChange}
                styleURL={MapboxGL.StyleURL.Street}
                logoEnabled={false}
            >
                <MapboxGL.Camera
                    ref={cameraRef}
                    zoomLevel={18}
                    centerCoordinate={coordinates}
                    pitch={45} // 3D map feel
                />

                {/* Render 3D Buildings */}
                <MapboxGL.VectorSource id="composite" url="mapbox://mapbox.mapbox-streets-v8">
                    <MapboxGL.FillExtrusionLayer
                        id="3d-buildings"
                        sourceLayerID="building"
                        filter={['==', 'extrude', 'true']}
                        style={{
                            fillExtrusionOpacity: 0.8,
                            fillExtrusionColor: '#e2e8f0',
                            fillExtrusionHeight: ['get', 'height'],
                            fillExtrusionBase: ['get', 'min_height'],
                        }}
                    />
                </MapboxGL.VectorSource>
            </MapboxGL.MapView>

            {/* The Center Pin Stays Static in the Middle of the Screen */}
            <View style={styles.pinContainer} pointerEvents="none">
                <View style={styles.pinBody} />
                <View style={styles.pinPoint} />
                <View style={styles.pinShadow} />
            </View>

            {/* Control Panel */}
            <View style={styles.footer}>
                <View style={styles.card}>
                    <Text style={styles.label}>Precise Drop-off Location</Text>
                    <Text style={styles.address}>{address}</Text>
                    <Text style={styles.coords}>
                        {coordinates[1].toFixed(6)}, {coordinates[0].toFixed(6)}
                        <Text style={{ color: accuracy > 10 ? '#ef4444' : '#10b981' }}>
                            {' '}• Acc: &plusmn;{accuracy.toFixed(1)}m
                        </Text>
                    </Text>

                    <TouchableOpacity
                        style={[styles.button, accuracy > 10 && styles.buttonDisabled]}
                        onPress={handleConfirmLocation}
                        disabled={isConfirming}
                    >
                        <Text style={styles.buttonText}>
                            {isConfirming ? 'Saving Geofence...' : 'Confirm Location'}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <Toast />
        </View>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f111a' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    map: { flex: 1 },
    pinContainer: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        marginLeft: -15, // half of width
        marginTop: -45,  // offset full height so bottom parses at center
        alignItems: 'center',
    },
    pinBody: {
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: '#4f46e5',
        borderWidth: 2,
        borderColor: 'white',
        elevation: 5,
        shadowColor: '#000',
        shadowOpacity: 0.3,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
    },
    pinPoint: {
        width: 4,
        height: 15,
        backgroundColor: '#3730a3',
    },
    pinShadow: {
        width: 10,
        height: 4,
        borderRadius: 5,
        backgroundColor: 'rgba(0,0,0,0.3)',
        marginTop: 2,
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 20,
        right: 20,
    },
    card: {
        backgroundColor: 'rgba(22, 25, 37, 0.95)',
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
    },
    label: { color: '#94a3b8', fontSize: 13, textTransform: 'uppercase', fontWeight: '600', marginBottom: 5 },
    address: { color: 'white', fontSize: 18, fontWeight: '700', marginBottom: 5 },
    coords: { color: '#94a3b8', fontSize: 12, marginBottom: 15 },
    button: {
        backgroundColor: '#4f46e5',
        paddingVertical: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonDisabled: { backgroundColor: '#312e81', opacity: 0.5 },
    buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
});

export default PrecisePinMap;
