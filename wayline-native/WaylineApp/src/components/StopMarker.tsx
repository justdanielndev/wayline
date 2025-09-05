import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import { Stop, Route } from '../types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://waylineapi.isitzoe.dev';

interface StopMarkerProps {
  stop: Stop;
  providerConfig?: any;
}

export const StopMarker: React.FC<StopMarkerProps> = ({ stop, providerConfig = {} }) => {

  const renderRouteIcon = (route: Route, size: number = 20) => {
    const lineId = route.route_short_name;
    const routeFeedId = route.feed_onestop_id || stop.feed_onestop_id;
    const provider = routeFeedId ? providerConfig[routeFeedId] : undefined;
    
    if (!provider) {
      let bgColor = route.route_color || '#6b46c1';
      if (bgColor.length === 9 && bgColor.endsWith('FF')) {
        bgColor = bgColor.slice(0, 7);
      }
      
      return (
        <View 
          style={[
            styles.routeIcon,
            {
              width: size,
              height: size,
              backgroundColor: bgColor,
            }
          ]}
        >
          <Text style={[styles.routeText, { fontSize: size * 0.5 }]}>
            {lineId?.slice(0, 2) || 'R'}
          </Text>
        </View>
      );
    }

    if (provider['lines-icons'] && provider['lines-icons'][lineId]) {
      const iconUri = provider['lines-icons'][lineId].startsWith('/')
        ? `${API_BASE_URL}${provider['lines-icons'][lineId]}`
        : provider['lines-icons'][lineId];
      
      return (
        <View style={{ width: size, height: size }}>
          <Image 
            key={`${iconUri}-${stop.stop_id}`}
            source={{ 
              uri: iconUri,
              cache: 'reload',
            }}
            style={{ 
              width: size, 
              height: size,
              position: 'absolute',
            }}
            resizeMode="contain"
            fadeDuration={0}
          />
        </View>
      );
    }
    
    const borderRadius = provider['lines-corner-radius'] || 4;
    let backgroundColor = provider['lines-colors']?.[lineId] || 
                          provider['lines-background-color'] || 
                          route.route_color || '#6b46c1';
    if (backgroundColor.length === 9 && backgroundColor.endsWith('FF')) {
      backgroundColor = backgroundColor.slice(0, 7);
    }
    
    const textColor = provider['lines-text-color'] || 'white';
    
    return (
      <View 
        style={[
          styles.routeIcon,
          {
            width: size,
            height: size,
            backgroundColor,
            borderRadius: borderRadius === '50%' ? size / 2 : borderRadius,
          }
        ]}
      >
        <Text style={[styles.routeText, { color: textColor, fontSize: size * 0.5 }]}>
          {lineId}
        </Text>
      </View>
    );
  };

  const provider = stop.feed_onestop_id ? providerConfig[stop.feed_onestop_id] : null;
  const isTrainStation = provider?.type === 'train' || (stop.routes && stop.routes.some(r => r.route_type === 2));

  const routes = stop.routes || [];
  
  if (isTrainStation && provider?.logo) {
    const logoUri = provider.logo.startsWith('/') 
      ? `${API_BASE_URL}${provider.logo}` 
      : provider.logo;
    
    return (
      <View style={styles.container}>
        <View style={styles.routesContainer}>
          <View style={styles.routeWrapper}>
            <View style={{ width: 20, height: 20 }}>
              <Image 
                key={`${logoUri}-${stop.stop_id}`}
                source={{ 
                  uri: logoUri,
                  cache: 'reload',
                }}
                style={{ 
                  width: 20, 
                  height: 20,
                  position: 'absolute',
                }}
                resizeMode="contain"
                fadeDuration={0}
              />
            </View>
          </View>
        </View>
      </View>
    );
  }

  if (routes.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.routesContainer}>
          <View style={[styles.routeIcon, styles.genericStopIcon]}>
            <Text style={styles.routeText}>●</Text>
          </View>
        </View>
      </View>
    );
  }

  const visibleRoutes = routes.slice(0, 3);
  const remainingCount = routes.length - 3;

  return (
    <View style={styles.container}>
      <View style={styles.routesContainer}>
        {visibleRoutes.map((route, index) => (
          <View key={`${route.route_id}-${index}`} style={styles.routeWrapper}>
            {renderRouteIcon(route, 20)}
          </View>
        ))}
        {remainingCount > 0 && (
          <View style={styles.moreRoutes}>
            <Text style={styles.moreText}>+{remainingCount}</Text>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
    minWidth: 30,
    minHeight: 25,
  },
  routesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeWrapper: {
    marginHorizontal: 2,
  },
  routeIcon: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  routeText: {
    fontWeight: 'bold',
    color: 'white',
  },
  moreRoutes: {
    backgroundColor: '#e5e7eb',
    borderRadius: 9,
    paddingHorizontal: 6,
    height: 18,
    justifyContent: 'center',
    marginLeft: 2,
  },
  moreText: {
    fontSize: 10,
    color: '#6b7280',
    fontWeight: '600',
  },
  genericStopIcon: {
    width: 20,
    height: 20,
    backgroundColor: '#9ca3af',
    borderRadius: 10,
  },
});