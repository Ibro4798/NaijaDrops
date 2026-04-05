/**
 * Maestro AI Batching Engine (Maestro V1)
 * 
 * This utility handles the logic for grouping multiple orders into a single 
 * 'Batch' to maximize rider earnings and reduce fuel costs.
 */

import { calculateDistance } from './distance';
import { getMapboxMatrix } from './mapbox';

/**
 * findBatchableOrders
 * 
 * Given a set of active orders, identifies clusters that can be delivered in a single trip.
 * 
 * @param {Array} orders - List of orders with lat/lng
 * @param {Object} options - Clustering parameters (maxRadius, maxBatchSize)
 * @returns {Array} List of 'Batch' objects
 */
export const findBatchableOrders = async (orders, options = { maxPickupDrivingMeters: 1500, maxDropoffRadiusKm: 3.0, maxBatchSize: 3 }) => {
    if (!orders || orders.length < 2) return [];

    const batches = [];
    const processedIds = new Set();
    
    // We limit to 24 orders to stay well within Mapbox Matrix API 25 coordinate limit
    const limitedOrders = orders.slice(0, 24);
    
    // Fetch real driving matrix for all pickups
    const pickupCoords = limitedOrders.map(o => ({ lat: o.pickup_lat, lng: o.pickup_lng }));
    const pickupMatrix = await getMapboxMatrix(pickupCoords);
    const hasMatrix = pickupMatrix && pickupMatrix.distances;

    // 1. Group by Pickup Area Proximity
    for (let i = 0; i < limitedOrders.length; i++) {
        const orderA = limitedOrders[i];
        if (processedIds.has(orderA.id)) continue;

        const currentBatch = [orderA];
        processedIds.add(orderA.id);

        for (let j = 0; j < limitedOrders.length; j++) {
            if (i === j) continue;
            const orderB = limitedOrders[j];
            if (processedIds.has(orderB.id)) continue;

            // Use Mapbox real driving distance if available, otherwise fallback to straight line
            let pickupDistMeters = 99999;
            if (hasMatrix && pickupMatrix.distances[i][j] !== undefined && pickupMatrix.distances[i][j] !== null) {
                pickupDistMeters = pickupMatrix.distances[i][j];
            } else {
                pickupDistMeters = calculateDistance(orderA.pickup_lat, orderA.pickup_lng, orderB.pickup_lat, orderB.pickup_lng) * 1000;
            }
            
            if (pickupDistMeters < options.maxPickupDrivingMeters) {
                // Check if dropoffs are in the same general direction/proximity
                const dropoffDistKm = calculateDistance(orderA.dropoff_lat, orderA.dropoff_lng, orderB.dropoff_lat, orderB.dropoff_lng);
                
                if (dropoffDistKm < options.maxDropoffRadiusKm) {
                    currentBatch.push(orderB);
                    processedIds.add(orderB.id);
                }
            }

            if (currentBatch.length >= options.maxBatchSize) break;
        }

        if (currentBatch.length > 1) {
            batches.push({
                id: `batch-${orderA.id.slice(0, 5)}`,
                orders: currentBatch,
                totalFare: currentBatch.reduce((sum, o) => sum + (o.agreed_price || 0), 0),
                pickupPoint: { 
                    name: orderA.pickup_name, 
                    lat: orderA.pickup_lat, 
                    lng: orderA.pickup_lng 
                },
                type: 'cluster'
            });
        }
    }

    return batches;
};

/**
 * calculateOptimizedRoute
 * 
 * Determines the best sequence of waypoints for a batched delivery.
 */
export const calculateOptimizedRoute = (batch) => {
    if (!batch || !batch.orders) return [];

    // Simple heuristic: Pickup -> Dropoff 1 -> Dropoff 2 ... Sorted by distance from pickup
    const waypoints = [];
    
    // All pickups are assumed cluster-close, so we pick the first one as origin
    const origin = { lat: batch.orders[0].pickup_lat, lng: batch.orders[0].pickup_lng, label: 'Pickup Cluster' };
    
    const dropoffs = batch.orders.map(o => ({
        lat: o.dropoff_lat,
        lng: o.dropoff_lng,
        name: o.dropoff_name,
        details: o.dropoff_details,
        id: o.id
    }));

    // Sort dropoffs by distance from origin (greedy nearest neighbor)
    const sortedDropoffs = [...dropoffs].sort((a, b) => {
        const distA = calculateDistance(origin.lat, origin.lng, a.lat, a.lng);
        const distB = calculateDistance(origin.lat, origin.lng, b.lat, b.lng);
        return distA - distB;
    });

    return [origin, ...sortedDropoffs];
};
