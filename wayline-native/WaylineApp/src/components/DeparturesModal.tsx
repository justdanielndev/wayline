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
  TextInput,
} from 'react-native';
import { Stop, DepartureResponse, Route } from '../types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import tripGoService from '../services/tripgo';
import type { TripGoTrip, TripGoSegment } from '../services/tripgo';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://3000.pluraldan.link';

interface DeparturesModalProps {
  stop: Stop | null;
  departures: DepartureResponse | any;
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

const formatTime = (timestamp: number) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

const formatDuration = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours > 0) {
    return `${hours}h ${remainingMinutes}m`;
  }
  return `${minutes}m`;
};

const getModeIcon = (mode: string): any => {
  if (!mode) return 'navigate';
  const modeStr = mode.toLowerCase();
  if (modeStr.includes('walk')) return 'walk';
  if (modeStr.includes('bus')) return 'bus';
  if (modeStr.includes('train') || modeStr.includes('rail')) return 'train';
  if (modeStr.includes('ferry')) return 'boat';
  if (modeStr.includes('car')) return 'car';
  if (modeStr.includes('bicycle')) return 'bicycle';
  return 'navigate';
};

const getModeColor = (mode: string): string => {
  if (!mode) return '#757575';
  const modeStr = mode.toLowerCase();
  if (modeStr.includes('walk')) return '#4CAF50';
  if (modeStr.includes('bus')) return '#2196F3';
  if (modeStr.includes('train') || modeStr.includes('rail')) return '#9C27B0';
  if (modeStr.includes('ferry')) return '#00BCD4';
  if (modeStr.includes('car')) return '#607D8B';
  if (modeStr.includes('bicycle')) return '#FF9800';
  return '#757575';
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
  
  const [showTripPlanning, setShowTripPlanning] = useState(false);
  const [destinationSearch, setDestinationSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedDestination, setSelectedDestination] = useState<any>(null);
  const [tripResults, setTripResults] = useState<Array<{ trip: TripGoTrip; segments: TripGoSegment[] }>>([]);
  const [planningTrip, setPlanningTrip] = useState(false);
  const [selectedTrip, setSelectedTrip] = useState<{ trip: TripGoTrip; segments: TripGoSegment[] } | null>(null);

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

  const searchDestinations = useCallback(async (query: string) => {
    if (query.length < 2) {
      setSearchResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const results = await tripGoService.searchLocations(query, {
        lat: stop?.stop_lat || 0,
        lng: stop?.stop_lon || 0,
      });
      setSearchResults(results.choices || []);
    } catch (error) {
      console.error('Error searching destinations:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [stop]);

  const planTrip = useCallback(async () => {
    if (!stop || !selectedDestination) return;

    setPlanningTrip(true);
    setTripResults([]);

    try {
      const routingResponse = await tripGoService.calculateRoute(
        {
          lat: stop.stop_lat,
          lng: stop.stop_lon,
          name: stop.stop_name,
        },
        {
          lat: selectedDestination.lat,
          lng: selectedDestination.lng,
          name: selectedDestination.name,
        },
        {
          departAfter: Math.floor(Date.now() / 1000),
          modes: ['pt_pub'],
          bestOnly: false,
        }
      );

      const processedTrips = tripGoService.processRoutingResponse(routingResponse);
      setTripResults(processedTrips);
    } catch (error) {
      console.error('Error planning trip:', error);
    } finally {
      setPlanningTrip(false);
    }
  }, [stop, selectedDestination]);

  const resetTripPlanningState = useCallback(() => {
    setShowTripPlanning(false);
    setDestinationSearch('');
    setSearchResults([]);
    setSelectedDestination(null);
    setTripResults([]);
    setSelectedTrip(null);
    setIsSearching(false);
    setPlanningTrip(false);
  }, []);

  const closeModal = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      resetTripPlanningState();
    });
  }, [onClose, slideAnim, resetTripPlanningState]);

  useEffect(() => {
    if (isVisible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(SCREEN_HEIGHT);
      resetTripPlanningState();
    }
  }, [isVisible, resetTripPlanningState]);

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

  interface ExtendedDeparture {
    departure_time: string;
    arrival_time?: string;
    minutes_until?: number | null;
    minutes_from_now?: number;
    is_tomorrow?: boolean;
    trip_id?: string;
    trip_headsign?: string;
    realtime?: boolean;
    schedule_relationship?: string;
    route?: {
      route_id?: string;
      route_short_name: string;
      route_long_name?: string;
      route_color?: string;
      route_type: number;
      feed_onestop_id?: string;
    };
  }

  const renderDeparture = (departure: ExtendedDeparture, category: string) => {
    const serverTime = departures?.server_time || Date.now();
    const timeDiff = currentTime - serverTime;
    const minutesFromNow = Math.max(0, Math.floor((departure.minutes_from_now || 0) - (timeDiff / 60000)));
    const isRealtime = departure.realtime || departure.schedule_relationship !== 'STATIC';
    
    return (
      <View key={`${departure.trip_id}-${departure.departure_time}`} style={styles.departureItem}>
        <View style={styles.departureLeft}>
          {departure.route && renderRouteIcon(departure.route as Route, 36)}
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
          <View style={styles.headerButtons}>
            {showTripPlanning && (
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  resetTripPlanningState();
                }}
              >
                <Ionicons name="arrow-back" size={20} color="#8B7FC4" />
              </TouchableOpacity>
            )}
            {!showTripPlanning && (
              <TouchableOpacity
                style={styles.goButton}
                onPress={() => setShowTripPlanning(true)}
              >
                <Text style={styles.goButtonText}>Go</Text>
                <Ionicons name="arrow-forward" size={16} color="white" />
              </TouchableOpacity>
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
          nestedScrollEnabled={false}
        >
          {showTripPlanning && !selectedTrip ? (
            <View style={styles.tripPlanningContent}>
              {tripResults.length === 0 && (
                <View style={styles.searchSection}>
                  <Text style={styles.searchTitle}>Where do you want to go?</Text>
                <View style={styles.searchInputContainer}>
                  <Ionicons name="search" size={20} color="#6B7280" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search for a destination..."
                    value={destinationSearch}
                    onChangeText={(text) => {
                      setDestinationSearch(text);
                      searchDestinations(text);
                    }}
                    autoFocus
                  />
                </View>
                </View>
              )}

              {selectedDestination && tripResults.length === 0 && (
                <View style={styles.selectedDestination}>
                  <View style={styles.selectedDestinationInfo}>
                    <Ionicons name="location" size={20} color="#8B7FC4" />
                    <Text style={styles.selectedDestinationText}>
                      {selectedDestination.name}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.planTripButton}
                    onPress={planTrip}
                  >
                    <Text style={styles.planTripButtonText}>Plan Trip</Text>
                  </TouchableOpacity>
                </View>
              )}

              {isSearching ? (
                <ActivityIndicator style={styles.searchLoader} size="small" color="#B8A9E6" />
              ) : searchResults.length > 0 ? (
                <View>
                  {searchResults.map((item) => (
                    <TouchableOpacity
                      style={styles.searchResultItem}
                      onPress={() => {
                        setSelectedDestination(item);
                        setDestinationSearch(item.name);
                        setSearchResults([]);
                      }}
                    >
                      <View style={styles.searchResultIcon}>
                        <Ionicons 
                          name={item.stopCode ? 'bus' : 'location'} 
                          size={20} 
                          color="#6B7280" 
                        />
                      </View>
                      <View style={styles.searchResultText}>
                        <Text style={styles.searchResultName}>{item.name}</Text>
                        {item.address && (
                          <Text style={styles.searchResultAddress}>{item.address}</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}

              {planningTrip ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#B8A9E6" />
                  <Text style={styles.loadingText}>Planning your trip...</Text>
                </View>
              ) : tripResults.length > 0 ? (
                <View style={styles.tripResults}>
                  <Text style={styles.tripResultsTitle}>Trip Options</Text>
                  {tripResults.map((tripData, index) => {
                    const { trip, segments } = tripData;
                    const duration = trip.arrive - trip.depart;

                    return (
                      <TouchableOpacity 
                        key={index} 
                        style={styles.tripOption}
                        activeOpacity={0.7}
                        onPress={() => {
                          setSelectedTrip({ trip, segments });
                        }}
                      >
                        <View style={styles.tripHeader}>
                          <View>
                            <Text style={styles.tripTime}>
                              {formatTime(trip.depart)} - {formatTime(trip.arrive)}
                            </Text>
                            <Text style={styles.tripDuration}>{formatDuration(duration)}</Text>
                          </View>
                          {trip.carbon && (
                            <Text style={styles.carbonText}>
                              {(trip.carbon / 1000).toFixed(1)} kg CO₂
                            </Text>
                          )}
                        </View>

                        <View style={styles.segmentsContainer}>
                          {segments.map((segment, idx) => (
                            <View key={idx} style={styles.segment}>
                              <View style={[
                                styles.segmentLine,
                                { backgroundColor: getModeColor(segment.mode) }
                              ]} />
                              <View style={styles.segmentContent}>
                                <View style={[
                                  styles.modeIcon,
                                  { backgroundColor: getModeColor(segment.mode) }
                                ]}>
                                  <Ionicons 
                                    name={getModeIcon(segment.mode)} 
                                    size={16} 
                                    color="white" 
                                  />
                                </View>
                                <Text style={styles.segmentText} numberOfLines={1}>
                                  {segment.action || 'Travel'}
                                </Text>
                                {segment.duration && (
                                  <Text style={styles.segmentDuration}>
                                    {Math.round(segment.duration / 60)} min
                                  </Text>
                                )}
                              </View>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ) : showTripPlanning && selectedTrip ? (
                <View style={styles.tripDetails}>
                  <View style={styles.tripDetailsHeader}>
                    <TouchableOpacity
                      style={styles.backToTripsButton}
                      onPress={() => setSelectedTrip(null)}
                    >
                      <Ionicons name="arrow-back" size={20} color="#8B7FC4" />
                      <Text style={styles.backToTripsText}>Back to trips</Text>
                    </TouchableOpacity>
                  </View>
                  
                  <Text style={styles.tripDetailsTitle}>Trip Details</Text>
                  
                  <View style={styles.tripSummary}>
                    <View style={styles.tripSummaryTimes}>
                      <Text style={styles.tripDetailTime}>
                        {formatTime(selectedTrip.trip.depart)}
                      </Text>
                      <Ionicons name="arrow-forward" size={16} color="#6B7280" style={{ marginHorizontal: 8 }} />
                      <Text style={styles.tripDetailTime}>
                        {formatTime(selectedTrip.trip.arrive)}
                      </Text>
                    </View>
                    <Text style={styles.tripDetailDuration}>
                      {formatDuration(selectedTrip.trip.arrive - selectedTrip.trip.depart)}
                    </Text>
                    {selectedTrip.trip.carbon && (
                      <Text style={styles.tripDetailCarbon}>
                        {(selectedTrip.trip.carbon / 1000).toFixed(1)} kg CO₂
                      </Text>
                    )}
                  </View>
                  
                  <View style={styles.directionsContainer}>
                    <Text style={styles.directionsTitle}>Directions</Text>
                    {selectedTrip.segments && selectedTrip.segments.length > 0 ? (
                      selectedTrip.segments.map((segment, idx) => (
                      <View key={idx} style={styles.directionStep}>
                        <View style={styles.directionStepHeader}>
                          <View style={[
                            styles.directionIcon,
                            { backgroundColor: getModeColor(segment.mode) }
                          ]}>
                            <Ionicons 
                              name={getModeIcon(segment.mode)} 
                              size={20} 
                              color="white" 
                            />
                          </View>
                          <View style={styles.directionStepInfo}>
                            <Text style={styles.directionAction}>{segment.action || 'No description'}</Text>
                            <View style={styles.directionTimesRow}>
                              <Text style={styles.directionTime}>
                                {formatTime(segment.startTime)}
                              </Text>
                              {segment.duration && (
                                <>
                                  <Text style={styles.directionDuration}>
                                    ({Math.round(segment.duration / 60)} min)
                                  </Text>
                                  <Text style={styles.directionTime}>
                                    → {formatTime(segment.endTime)}
                                  </Text>
                                </>
                              )}
                            </View>
                            {segment.from && segment.to && (
                              <Text style={styles.directionLocations}>
                                From: {segment.from.name || 'Unknown'}
                                {segment.to.name && ` → To: ${segment.to.name}`}
                              </Text>
                            )}
                            {segment.modeInfo?.alt && (
                              <Text style={styles.directionModeInfo}>
                                {segment.modeInfo.alt}
                              </Text>
                            )}
                            {segment.metres && (
                              <Text style={styles.directionDistance}>
                                {segment.metres < 1000 
                                  ? `${segment.metres}m` 
                                  : `${(segment.metres / 1000).toFixed(1)}km`
                                }
                              </Text>
                            )}
                          </View>
                        </View>
                      </View>
                      ))
                    ) : (
                      <View style={styles.noDirectionsContainer}>
                        <Text style={styles.noDirectionsText}>No directions available</Text>
                        <Text style={styles.debugText}>Unable to load route details. Please try again.</Text>
                      </View>
                    )}
                  </View>
                </View>
          ) : !showTripPlanning && loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#6b46c1" />
              <Text style={styles.loadingText}>Loading departures...</Text>
            </View>
          ) : !showTripPlanning && departures ? (
            <>
              {(() => {
                const serverTime = departures.server_time || Date.now();
                const timeDiff = currentTime - serverTime;
                const departureData = departures.departures || {};
                const allDepartures = [
                  ...(Array.isArray(departureData.past) ? departureData.past : []),
                  ...(Array.isArray(departureData.upcoming) ? departureData.upcoming : []),
                  ...(Array.isArray(departureData.later) ? departureData.later : [])
                ];
                
                const recategorized = {
                  past: [] as ExtendedDeparture[],
                  upcoming: [] as ExtendedDeparture[],
                  later: [] as ExtendedDeparture[]
                };
                
                allDepartures.forEach((dep: ExtendedDeparture) => {
                  const adjustedMinutes = Math.floor((dep.minutes_from_now || dep.minutes_until || 0) - (timeDiff / 60000));
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
                  count={recategorized.past.length}
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
    minHeight: SCREEN_HEIGHT * 0.65,
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
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  backButton: {
    backgroundColor: '#E6E0F5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  goButton: {
    backgroundColor: '#B8A9E6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  goButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Figtree_600SemiBold',
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
  tripPlanningContent: {
    flex: 1,
  },
  searchSection: {
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  searchTitle: {
    fontSize: 18,
    fontFamily: 'Figtree_600SemiBold',
    color: '#111827',
    marginBottom: 12,
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  searchInput: {
    flex: 1,
    marginLeft: 12,
    fontSize: 16,
    fontFamily: 'Figtree_400Regular',
    color: '#111827',
  },
  selectedDestination: {
    backgroundColor: '#E6E0F5',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 20,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  selectedDestinationInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedDestinationText: {
    marginLeft: 8,
    fontSize: 16,
    fontFamily: 'Figtree_500Medium',
    color: '#111827',
    flex: 1,
  },
  planTripButton: {
    backgroundColor: '#B8A9E6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  planTripButtonText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Figtree_600SemiBold',
  },
  searchLoader: {
    marginTop: 40,
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  searchResultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    fontFamily: 'Figtree_500Medium',
    color: '#111827',
  },
  searchResultAddress: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#6B7280',
    marginTop: 2,
  },
  tripResults: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  tripResultsTitle: {
    fontSize: 18,
    fontFamily: 'Figtree_600SemiBold',
    color: '#111827',
    marginBottom: 16,
  },
  tripOption: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tripTime: {
    fontSize: 16,
    fontFamily: 'Figtree_600SemiBold',
    color: '#111827',
  },
  tripDuration: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#6B7280',
    marginTop: 2,
  },
  carbonText: {
    fontSize: 12,
    fontFamily: 'Figtree_400Regular',
    color: '#059669',
  },
  segmentsContainer: {
    gap: 8,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  segmentLine: {
    width: 3,
    height: 28,
    marginRight: 12,
    borderRadius: 1.5,
  },
  segmentContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  segmentText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#374151',
  },
  segmentDuration: {
    fontSize: 12,
    fontFamily: 'Figtree_400Regular',
    color: '#9CA3AF',
  },
  tripDetails: {
    flex: 1,
    paddingHorizontal: 20,
  },
  tripDetailsHeader: {
    marginBottom: 16,
  },
  backToTripsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  backToTripsText: {
    fontSize: 16,
    fontFamily: 'Figtree_500Medium',
    color: '#8B7FC4',
  },
  tripDetailsTitle: {
    fontSize: 20,
    fontFamily: 'Figtree_700Bold',
    color: '#111827',
    marginBottom: 16,
  },
  tripSummary: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tripSummaryTimes: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripDetailTime: {
    fontSize: 18,
    fontFamily: 'Figtree_600SemiBold',
    color: '#111827',
  },
  tripDetailDuration: {
    fontSize: 16,
    fontFamily: 'Figtree_500Medium',
    color: '#6B7280',
    marginBottom: 4,
  },
  tripDetailCarbon: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#059669',
  },
  directionsContainer: {
    marginTop: 20,
    paddingBottom: 20,
  },
  directionsTitle: {
    fontSize: 18,
    fontFamily: 'Figtree_600SemiBold',
    color: '#111827',
    marginBottom: 16,
  },
  directionStep: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  directionStepHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  directionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  directionStepInfo: {
    flex: 1,
  },
  directionAction: {
    fontSize: 16,
    fontFamily: 'Figtree_600SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  directionTimesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  directionTime: {
    fontSize: 14,
    fontFamily: 'Figtree_500Medium',
    color: '#374151',
  },
  directionDuration: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#6B7280',
  },
  directionLocations: {
    fontSize: 13,
    fontFamily: 'Figtree_400Regular',
    color: '#6B7280',
    marginTop: 2,
  },
  directionModeInfo: {
    fontSize: 13,
    fontFamily: 'Figtree_400Regular',
    color: '#6B7280',
    marginTop: 2,
    fontStyle: 'italic',
  },
  directionDistance: {
    fontSize: 13,
    fontFamily: 'Figtree_500Medium',
    color: '#374151',
    marginTop: 4,
  },
  noDirectionsText: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 20,
  },
  noDirectionsContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  debugText: {
    fontSize: 12,
    fontFamily: 'Figtree_400Regular',
    color: '#9CA3AF',
    marginTop: 8,
  },
});