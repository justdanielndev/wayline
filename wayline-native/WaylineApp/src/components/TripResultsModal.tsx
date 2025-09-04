import React, { useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { TripGoTrip, TripGoSegment } from '../services/tripgo';

const SCREEN_HEIGHT = Dimensions.get('window').height;

interface TripResultsModalProps {
  isVisible: boolean;
  onClose: () => void;
  trips: Array<{ trip: TripGoTrip; segments: TripGoSegment[] }>;
  loading: boolean;
  origin: string;
  destination: string;
}

export const TripResultsModal: React.FC<TripResultsModalProps> = ({
  isVisible,
  onClose,
  trips,
  loading,
  origin,
  destination,
}) => {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return gestureState.dy > 5 && Math.abs(gestureState.dx) < Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          slideAnim.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
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
    if (mode.includes('walk')) return 'walk';
    if (mode.includes('bus')) return 'bus';
    if (mode.includes('train') || mode.includes('rail')) return 'train';
    if (mode.includes('ferry')) return 'boat';
    if (mode.includes('car')) return 'car';
    if (mode.includes('bicycle')) return 'bicycle';
    return 'navigate';
  };

  const getModeColor = (mode: string): string => {
    if (mode.includes('walk')) return '#4CAF50';
    if (mode.includes('bus')) return '#2196F3';
    if (mode.includes('train') || mode.includes('rail')) return '#9C27B0';
    if (mode.includes('ferry')) return '#00BCD4';
    if (mode.includes('car')) return '#607D8B';
    if (mode.includes('bicycle')) return '#FF9800';
    return '#757575';
  };

  if (!isVisible) return null;

  return (
    <View style={styles.modalContainer} pointerEvents={isVisible ? 'auto' : 'none'}>
      <TouchableOpacity
        style={[styles.backdrop, { opacity: isVisible ? 1 : 0 }]}
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
          <View>
            <Text style={styles.title}>Trip Options</Text>
            <View style={styles.routeInfo}>
              <Text style={styles.routeText}>{origin}</Text>
              <Ionicons name="arrow-forward" size={16} color="#6B7280" />
              <Text style={styles.routeText}>{destination}</Text>
            </View>
          </View>
        </View>

        <ScrollView 
          style={styles.content} 
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#007AFF" />
              <Text style={styles.loadingText}>Planning your trip...</Text>
            </View>
          ) : trips.length > 0 ? (
            <View style={styles.tripsContainer}>
              {trips.map((tripData, index) => {
                const { trip, segments } = tripData;
                const duration = trip.arrive - trip.depart;

                return (
                  <TouchableOpacity key={index} style={styles.tripOption}>
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
                              {segment.action}
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
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No trips found</Text>
              <Text style={styles.emptyStateSubtext}>
                Try adjusting your search or check back later
              </Text>
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
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontFamily: 'Figtree_700Bold',
    color: '#111827',
    marginBottom: 8,
  },
  routeInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeText: {
    fontSize: 14,
    fontFamily: 'Figtree_500Medium',
    color: '#6B7280',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
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
  tripsContainer: {
    paddingBottom: 20,
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  emptyStateText: {
    fontSize: 16,
    fontFamily: 'Figtree_600SemiBold',
    color: '#111827',
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#6B7280',
  },
});