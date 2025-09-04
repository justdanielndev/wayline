import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  ScrollView,
  ActivityIndicator,
  Image,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  BackHandler,
} from 'react-native';
import { Stop, DepartureResponse, Route } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://3000.pluraldan.link';

interface DeparturesModalProps {
  stop: Stop | null;
  departures: DepartureResponse | null;
  loading: boolean;
  isVisible: boolean;
  onClose: () => void;
  providerConfig: any;
}

interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultExpanded?: boolean;
  collapsible?: boolean;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ 
  title, 
  count, 
  defaultExpanded = true, 
  collapsible = true,
  children 
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const animatedHeight = useRef(new Animated.Value(defaultExpanded ? 1 : 0)).current;

  const toggleExpanded = () => {
    const toValue = expanded ? 0 : 1;
    setExpanded(!expanded);
    Animated.timing(animatedHeight, {
      toValue,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  return (
    <View style={styles.section}>
      <TouchableOpacity 
        onPress={collapsible ? toggleExpanded : undefined} 
        style={styles.sectionHeader}
        activeOpacity={collapsible ? 0.7 : 1}
      >
        <Text style={styles.sectionTitle}>{title}</Text>
        <View style={styles.sectionRight}>
          <Text style={styles.sectionCount}>{count}</Text>
          {collapsible && (
            <Text style={[styles.chevron, expanded && styles.chevronExpanded]}>›</Text>
          )}
        </View>
      </TouchableOpacity>
      <Animated.View style={{
        maxHeight: animatedHeight.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 1000],
        }),
        overflow: 'hidden',
      }}>
        {children}
      </Animated.View>
    </View>
  );
};

export const DeparturesModal: React.FC<DeparturesModalProps> = ({
  stop,
  departures,
  loading,
  isVisible,
  onClose,
  providerConfig,
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const [isDragging, setIsDragging] = useState(false);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const updateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isVisible) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        onClose();
        return true;
      });
      return () => backHandler.remove();
    }
  }, [isVisible, onClose]);

  useEffect(() => {
    if (isVisible && departures) {
      setCurrentTime(Date.now());
      
      updateIntervalRef.current = setInterval(() => {
        setCurrentTime(Date.now());
      }, 30000);
      
      return () => {
        if (updateIntervalRef.current) {
          clearInterval(updateIntervalRef.current);
          updateIntervalRef.current = null;
        }
      };
    }
  }, [isVisible, departures]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5 && Math.abs(gestureState.dx) < Math.abs(gestureState.dy);
      },
      onPanResponderGrant: () => {
        setIsDragging(true);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        setIsDragging(false);
        if (gestureState.dy > 100 || gestureState.vy > 0.5) {
          closeModal();
        } else {
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const closeModal = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
    });
  }, [onClose, slideAnim]);

  useEffect(() => {
    if (isVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
    }
  }, [isVisible]);

  if (!stop || !isVisible) return null;

  const provider = stop.feed_onestop_id ? providerConfig[stop.feed_onestop_id] : null;

  const renderRouteIcon = (route: Route, size: number = 32) => {
    const lineId = route.route_short_name;
    const routeProvider = route.feed_onestop_id ? providerConfig[route.feed_onestop_id] : provider;
    
    if (routeProvider?.['lines-icons']?.[lineId]) {
      const iconUri = routeProvider['lines-icons'][lineId].startsWith('/')
        ? `${API_BASE_URL}${routeProvider['lines-icons'][lineId]}`
        : routeProvider['lines-icons'][lineId];
      return (
        <Image 
          source={{ uri: iconUri }}
          style={{ width: size, height: size }}
          resizeMode="contain"
        />
      );
    }
    
    const borderRadius = routeProvider?.['lines-corner-radius'] || 4;
    let backgroundColor = routeProvider?.['lines-colors']?.[lineId] || 
                          routeProvider?.['lines-background-color'] || 
                          route.route_color || '#6b46c1';
    if (backgroundColor.length === 9 && backgroundColor.endsWith('FF')) {
      backgroundColor = backgroundColor.slice(0, 7);
    }
    
    const textColor = routeProvider?.['lines-text-color'] || 'white';
    
    return (
      <View 
        style={[
          styles.routeBadge,
          {
            width: size,
            height: size,
            backgroundColor,
            borderRadius: borderRadius === '50%' ? size / 2 : borderRadius,
          }
        ]}
      >
        <Text style={[styles.routeBadgeText, { color: textColor }]}>
          {lineId || 'R'}
        </Text>
      </View>
    );
  };

  const renderDeparture = (departure: any, category: string) => {
    // @ts-expect-error - error expected
    const serverTime = departures?.server_time || Date.now();
    const timeDiff = currentTime - serverTime;
    const minutesFromNow = Math.max(0, Math.floor((departure.minutes_from_now || 0) - (timeDiff / 60000)));
    const isRealtime = departure.realtime || departure.schedule_relationship !== 'STATIC';
    
    return (
      <View key={`${departure.trip_id}-${departure.departure_time}`} style={styles.departureItem}>
        <View style={styles.departureLeft}>
          {renderRouteIcon(departure.route, 36)}
          <View style={styles.departureInfo}>
            <Text style={styles.headsign} numberOfLines={1}>
              {departure.trip_headsign || departure.route?.route_long_name || 'Unknown destination'}
            </Text>
            <Text style={styles.departureTime}>
              {departure.departure_time}
              {isRealtime && <Text style={styles.realtimeIndicator}> ● Live</Text>}
            </Text>
          </View>
        </View>
        <View style={styles.departureRight}>
          {category === 'upcoming' && (
            <Text style={[
              styles.minutesText,
              minutesFromNow <= 5 && styles.minutesTextUrgent
            ]}>
              {minutesFromNow === 0 ? 'Now' : minutesFromNow === 1 ? '1 min' : `${minutesFromNow} min`}
            </Text>
          )}
          {category === 'past' && (
            <Text style={styles.minutesTextPast}>Departed</Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <View 
      style={[
        styles.modalContainer,
        { zIndex: 1000 },
      ]}
      pointerEvents={isVisible ? 'auto' : 'none'}
    >
      <TouchableOpacity
        style={[
          styles.backdrop,
          { opacity: isVisible ? 1 : 0 },
        ]}
        onPress={closeModal}
        activeOpacity={1}
      />
      
      <Animated.View
        {...panResponder.panHandlers}
        style={[
          styles.container,
          {
            transform: [{ translateY: slideAnim }],
            paddingBottom: insets.bottom || 20,
          },
        ]}
      >
        <View style={styles.handle} />
        
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.stopName}>{stop.stop_name}</Text>
            {provider && (
              <View style={styles.providerInfo}>
                {provider.logo && (
                  <Image
                    source={{ uri: `${API_BASE_URL}${provider.logo}` }}
                    style={styles.providerLogo}
                    resizeMode="contain"
                  />
                )}
                <Text style={styles.providerName}>{provider.name}</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.routesSection}>
          {stop.routes?.slice(0, 6).map((route, index) => (
            <View key={`${route.route_id}-${index}`} style={styles.routeChipWrapper}>
              {renderRouteIcon(route, 28)}
            </View>
          ))}
          {stop.routes && stop.routes.length > 6 && (
            <View style={styles.moreRoutesChip}>
              <Text style={styles.moreRoutesText}>+{stop.routes.length - 6}</Text>
            </View>
          )}
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
          scrollEnabled={!isDragging}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6b46c1" />
              <Text style={styles.loadingText}>Loading departures...</Text>
            </View>
          ) : departures ? (
            <>
              {(() => {
                // @ts-expect-error - error expected
                const serverTime = departures.server_time || Date.now();
                const timeDiff = currentTime - serverTime;
                const allDepartures = [
                  ...(departures.departures?.past || []),
                  ...(departures.departures?.upcoming || []),
                  ...(departures.departures?.later || [])
                ];
                
                const recategorized = {
                  past: [] as any[],
                  upcoming: [] as any[],
                  later: [] as any[]
                };
                
                allDepartures.forEach(dep => {
                  const adjustedMinutes = Math.floor((dep.minutes_from_now || 0) - (timeDiff / 60000));
                  if (adjustedMinutes < 0) {
                    recategorized.past.push({ ...dep, minutes_from_now: adjustedMinutes });
                  } else if (recategorized.upcoming.length < 5) {
                    recategorized.upcoming.push({ ...dep, minutes_from_now: adjustedMinutes });
                  } else {
                    recategorized.later.push({ ...dep, minutes_from_now: adjustedMinutes });
                  }
                });
                
                recategorized.past = recategorized.past.slice(-5);
                
                return (
                  <>
              {recategorized.past.length > 0 && (
                <CollapsibleSection 
                  title="Previous" 
                  count={departures.departures.past.length}
                  defaultExpanded={false}
                >
                  {recategorized.past.map((dep) => renderDeparture(dep, 'past'))}
                </CollapsibleSection>
              )}
              
              {recategorized.upcoming.length > 0 && (
                <CollapsibleSection 
                  title="Upcoming" 
                  count={recategorized.upcoming.length}
                  defaultExpanded={true}
                  collapsible={false}
                >
                  {recategorized.upcoming.map((dep) => renderDeparture(dep, 'upcoming'))}
                </CollapsibleSection>
              )}
              
              {recategorized.later.length > 0 && (
                <CollapsibleSection 
                  title="Later" 
                  count={recategorized.later.length}
                  defaultExpanded={false}
                >
                  {recategorized.later.map((dep) => renderDeparture(dep, 'later'))}
                </CollapsibleSection>
              )}
              
              {(recategorized.upcoming.length === 0 && 
                recategorized.later.length === 0 && 
                recategorized.past.length === 0) && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No departures available</Text>
                </View>
              )}
                  </>
                );
              })()}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Failed to load departures</Text>
            </View>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    ...StyleSheet.absoluteFillObject,
    elevation: 999,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#F9FAFB',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: SCREEN_HEIGHT * 0.8,
    minHeight: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  handle: {
    width: 48,
    height: 5,
    backgroundColor: '#D1D5DB',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
  },
  stopName: {
    fontSize: 24,
    fontFamily: 'Figtree_700Bold',
    color: '#111827',
    marginBottom: 6,
  },
  providerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  providerLogo: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  providerName: {
    fontSize: 14,
    fontFamily: 'Figtree_500Medium',
    color: '#6B7280',
  },
  routesSection: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  routeChipWrapper: {
    marginRight: 8,
    marginBottom: 8,
  },
  moreRoutesChip: {
    width: 28,
    height: 28,
    backgroundColor: '#E5E7EB',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  moreRoutesText: {
    fontSize: 12,
    fontFamily: 'Figtree_600SemiBold',
    color: '#6B7280',
  },
  content: {
    flex: 1,
  },
  section: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: 'Figtree_600SemiBold',
    color: '#374151',
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sectionCount: {
    fontSize: 14,
    fontFamily: 'Figtree_500Medium',
    color: '#9CA3AF',
    marginRight: 8,
  },
  chevron: {
    fontSize: 20,
    color: '#9CA3AF',
    transform: [{ rotate: '90deg' }],
  },
  chevronExpanded: {
    transform: [{ rotate: '-90deg' }],
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    fontFamily: 'Figtree_500Medium',
    color: '#6B7280',
  },
  departureItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  departureLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  routeBadge: {
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  routeBadgeText: {
    fontSize: 14,
    fontFamily: 'Figtree_700Bold',
  },
  departureInfo: {
    flex: 1,
  },
  headsign: {
    fontSize: 15,
    fontFamily: 'Figtree_500Medium',
    color: '#111827',
    marginBottom: 2,
  },
  departureTime: {
    fontSize: 13,
    fontFamily: 'Figtree_400Regular',
    color: '#6B7280',
  },
  realtimeIndicator: {
    color: '#10B981',
    fontSize: 12,
  },
  departureRight: {
    alignItems: 'flex-end',
  },
  minutesText: {
    fontSize: 16,
    fontFamily: 'Figtree_600SemiBold',
    color: '#111827',
  },
  minutesTextUrgent: {
    color: '#EF4444',
  },
  minutesTextPast: {
    fontSize: 14,
    fontFamily: 'Figtree_500Medium',
    color: '#9CA3AF',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Figtree_500Medium',
    color: '#9CA3AF',
  },
});