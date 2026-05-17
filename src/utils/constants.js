/**
 * Shared constants for the NaijaDrops application.
 * Use these to avoid "magic strings" and ensure consistency across the app.
 */

export const ORDER_STATUS = {
  LOOKING: 'looking_for_driver',
  AWAITING_PAYMENT: 'awaiting_payment',
  ACCEPTED: 'accepted',
  ARRIVING_PICKUP: 'arriving_pickup',
  PICKED_UP: 'picked_up',
  ARRIVING: 'arriving',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export const USER_ROLES = {
  RIDER: 'rider',
  VENDOR: 'vendor',
  ADMIN: 'admin',
};

export const DRIVER_STATUS = {
  PENDING: 'pending',
  ACTIVE: 'active',
  PAUSED: 'paused',
  REJECTED: 'rejected',
};

export const VEHICLE_TYPES = {
  BIKE: 'bike',
  CAR: 'car',
  VAN: 'van',
};

export const APP_CONFIG = {
  KANO_CENTER: { lat: 12.0022, lng: 8.5920 },
  DEFAULT_MAP_ZOOM: 13,
};

export const PRICING_RATES = {
  BIKE: { base: 400, perKm: 150 },
  CAR: { base: 800, perKm: 300 },
  VAN: { base: 1500, perKm: 500 },
  SIZE_MULTIPLIERS: {
    Pouch: 1.0,
    Small: 1.1,
    Medium: 1.4,
    Large: 2.0
  }
};
