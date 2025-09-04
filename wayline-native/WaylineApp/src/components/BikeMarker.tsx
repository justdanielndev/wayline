import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { BikeStation } from '../types';

interface BikeMarkerProps {
  station: BikeStation;
}

export const BikeMarker: React.FC<BikeMarkerProps> = ({ station }) => {
  const getColor = () => {
    if (!station.is_open) return '#9ca3af';
    if (station.available === 0) return '#ef4444';
    if (station.available <= 2) return '#f97316';
    return '#10b981';
  };

  const color = getColor();

  return (
    <View style={styles.container}>
      <View style={[styles.marker, { borderColor: color }]}>
        <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <Path
            d="M5 17a2 2 0 104 0 2 2 0 00-4 0zm10 0a2 2 0 104 0 2 2 0 00-4 0z"
            fill={color}
          />
          <Path
            d="M12 6v6l2 3M7 17h10M7 17l2-6h6l2 6"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
        
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>
            {station.is_open ? station.available : '✕'}
          </Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  marker: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'white',
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
  },
  badge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
  },
});