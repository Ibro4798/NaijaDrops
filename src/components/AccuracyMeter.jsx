"use client";

import { MapPin, Zap, Wifi, Globe } from 'lucide-react';

export default function AccuracyMeter({ accuracy, source = 'gps' }) {
  /**
   * Accuracy: distance in meters (Â±)
   * Source: 'gps' | 'wifi' | 'ip' | 'demo'
   */

  let color = 'text-red-500';
  let bgColor = 'bg-red-50';
  let borderColor = 'border-red-200';
  let trust = 'Poor';
  let icon = null;

  if (source === 'gps') {
    icon = <Zap size={16} />;
    if (accuracy < 20) {
      color = 'text-green-600';
      bgColor = 'bg-green-50';
      borderColor = 'border-green-200';
      trust = 'Excellent';
    } else if (accuracy < 50) {
      color = 'text-emerald-600';
      bgColor = 'bg-emerald-50';
      borderColor = 'border-emerald-200';
      trust = 'Good';
    } else if (accuracy < 100) {
      color = 'text-yellow-600';
      bgColor = 'bg-yellow-50';
      borderColor = 'border-yellow-200';
      trust = 'Fair';
    } else {
      color = 'text-orange-600';
      bgColor = 'bg-orange-50';
      borderColor = 'border-orange-200';
      trust = 'Poor';
    }
  } else if (source === 'wifi') {
    icon = <Wifi size={16} />;
    color = 'text-yellow-600';
    bgColor = 'bg-yellow-50';
    borderColor = 'border-yellow-200';
    trust = 'Fair (WiFi)';
  } else if (source === 'ip') {
    icon = <Globe size={16} />;
    color = 'text-red-500';
    bgColor = 'bg-red-50';
    borderColor = 'border-red-200';
    trust = 'Poor (IP)';
  } else {
    icon = <MapPin size={16} />;
    color = 'text-gray-600';
    bgColor = 'bg-gray-50';
    borderColor = 'border-gray-200';
    trust = 'Demo';
  }

  return (
    <div className={`${bgColor} ${borderColor} rounded-lg p-3 flex items-center gap-3 border`}>
      <div className={`${color}`}>{icon}</div>
      <div className="flex-1">
        <p className={`text-sm font-bold ${color}`}>{trust} Accuracy</p>
        {accuracy !== null && accuracy !== undefined && (
          <p className="text-xs text-gray-600">Â±{Math.round(accuracy)}m</p>
        )}
      </div>
    </div>
  );
}
