import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import tripGoService, { TripGoLocationResult, TripGoTrip, TripGoSegment } from '../services/tripgo';
import * as Location from 'expo-location';

interface LocationInput {
  location: TripGoLocationResult | null;
  searchText: string;
  isSearching: boolean;
  searchResults: TripGoLocationResult[];
}

export default function TripPlannerScreen() {
  const [origin, setOrigin] = useState<LocationInput>({
    location: null,
    searchText: '',
    isSearching: false,
    searchResults: [],
  });

  const [destination, setDestination] = useState<LocationInput>({
    location: null,
    searchText: '',
    isSearching: false,
    searchResults: [],
  });

  const [isPlanning, setIsPlanning] = useState(false);
  const [tripResults, setTripResults] = useState<Array<{ trip: TripGoTrip; segments: TripGoSegment[] }>>([]);
  const [showOriginSearch, setShowOriginSearch] = useState(false);
  const [showDestinationSearch, setShowDestinationSearch] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    getUserLocation();
  }, []);

  const getUserLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        return;
      }

      const location = await Location.getCurrentPositionAsync({});
      setUserLocation({
        lat: location.coords.latitude,
        lng: location.coords.longitude,
      });
    } catch (error) {
      console.error('Error getting location:', error);
    }
  };

  const searchLocations = async (query: string, isOrigin: boolean) => {
    if (query.length < 2) {
      if (isOrigin) {
        setOrigin(prev => ({ ...prev, searchResults: [] }));
      } else {
        setDestination(prev => ({ ...prev, searchResults: [] }));
      }
      return;
    }

    const setter = isOrigin ? setOrigin : setDestination;
    setter(prev => ({ ...prev, isSearching: true }));

    try {
      const nearLocation = userLocation || { lat: -33.8688, lng: 151.2093 };
      const results = await tripGoService.searchLocations(query, nearLocation);
      
      setter(prev => ({
        ...prev,
        searchResults: results.choices || [],
        isSearching: false,
      }));
    } catch (error) {
      console.error('Error searching locations:', error);
      setter(prev => ({ ...prev, isSearching: false, searchResults: [] }));
    }
  };

  const selectLocation = (location: TripGoLocationResult, isOrigin: boolean) => {
    if (isOrigin) {
      setOrigin({
        location,
        searchText: location.name,
        isSearching: false,
        searchResults: [],
      });
      setShowOriginSearch(false);
    } else {
      setDestination({
        location,
        searchText: location.name,
        isSearching: false,
        searchResults: [],
      });
      setShowDestinationSearch(false);
    }
  };

  const planTrip = async () => {
    if (!origin.location || !destination.location) {
      Alert.alert('Missing Information', 'Please select both origin and destination');
      return;
    }

    setIsPlanning(true);
    setTripResults([]);

    try {
      const routingResponse = await tripGoService.calculateRoute(
        {
          lat: origin.location.lat,
          lng: origin.location.lng,
          name: origin.location.name,
        },
        {
          lat: destination.location.lat,
          lng: destination.location.lng,
          name: destination.location.name,
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
      Alert.alert('Error', 'Failed to plan trip. Please try again.');
    } finally {
      setIsPlanning(false);
    }
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

  const renderLocationSearch = (isOrigin: boolean) => {
    const data = isOrigin ? origin : destination;
    const show = isOrigin ? showOriginSearch : showDestinationSearch;
    const setShow = isOrigin ? setShowOriginSearch : setShowDestinationSearch;

    return (
      <Modal
        visible={show}
        animationType="slide"
        onRequestClose={() => setShow(false)}
      >
        <View style={styles.searchModal}>
          <View style={styles.searchHeader}>
            <TouchableOpacity onPress={() => setShow(false)}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.searchTitle}>
              {isOrigin ? 'Select Origin' : 'Select Destination'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color="#666" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search for a location..."
              value={isOrigin ? origin.searchText : destination.searchText}
              onChangeText={(text) => {
                if (isOrigin) {
                  setOrigin(prev => ({ ...prev, searchText: text }));
                } else {
                  setDestination(prev => ({ ...prev, searchText: text }));
                }
                searchLocations(text, isOrigin);
              }}
              autoFocus
            />
          </View>

          {data.isSearching && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#007AFF" />
            </View>
          )}

          <FlatList
            data={data.searchResults}
            keyExtractor={(item, index) => `${item.lat}-${item.lng}-${index}`}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.searchResultItem}
                onPress={() => selectLocation(item, isOrigin)}
              >
                <View style={styles.searchResultIcon}>
                  <Ionicons 
                    name={item.stopCode ? 'bus' : 'location'} 
                    size={20} 
                    color="#666" 
                  />
                </View>
                <View style={styles.searchResultText}>
                  <Text style={styles.searchResultName}>{item.name}</Text>
                  {item.address && (
                    <Text style={styles.searchResultAddress}>{item.address}</Text>
                  )}
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      </Modal>
    );
  };

  const renderTripOption = ({ item }: { item: { trip: TripGoTrip; segments: TripGoSegment[] } }) => {
    const { trip, segments } = item;
    const duration = trip.arrive - trip.depart;

    return (
      <TouchableOpacity style={styles.tripOption}>
        <View style={styles.tripHeader}>
          <Text style={styles.tripTime}>
            {formatTime(trip.depart)} - {formatTime(trip.arrive)}
          </Text>
          <Text style={styles.tripDuration}>{formatDuration(duration)}</Text>
        </View>

        <View style={styles.segmentsContainer}>
          {segments.map((segment, index) => (
            <View key={index} style={styles.segmentRow}>
              {segment.mode && (
                <View style={[styles.modeIcon, { backgroundColor: getModeColor(segment.mode) }]}>
                  <Ionicons name={getModeIcon(segment.mode)} size={16} color="white" />
                </View>
              )}
              <Text style={styles.segmentText} numberOfLines={1}>
                {segment.action}
              </Text>
            </View>
          ))}
        </View>

        {trip.carbon && (
          <View style={styles.tripFooter}>
            <Text style={styles.carbonText}>
              CO₂: {(trip.carbon / 1000).toFixed(1)} kg
            </Text>
          </View>
        )}
      </TouchableOpacity>
    );
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Trip Planner</Text>
      </View>

      <View style={styles.inputSection}>
        <TouchableOpacity
          style={styles.locationInput}
          onPress={() => setShowOriginSearch(true)}
        >
          <View style={styles.locationIcon}>
            <Ionicons name="location" size={20} color="#007AFF" />
          </View>
          <View style={styles.locationTextContainer}>
            <Text style={styles.locationLabel}>From</Text>
            <Text style={styles.locationValue}>
              {origin.location?.name || 'Select origin'}
            </Text>
          </View>
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity
          style={styles.locationInput}
          onPress={() => setShowDestinationSearch(true)}
        >
          <View style={styles.locationIcon}>
            <Ionicons name="location" size={20} color="#FF5722" />
          </View>
          <View style={styles.locationTextContainer}>
            <Text style={styles.locationLabel}>To</Text>
            <Text style={styles.locationValue}>
              {destination.location?.name || 'Select destination'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={[styles.planButton, (!origin.location || !destination.location) && styles.planButtonDisabled]}
        onPress={planTrip}
        disabled={!origin.location || !destination.location || isPlanning}
      >
        {isPlanning ? (
          <ActivityIndicator color="white" />
        ) : (
          <>
            <Ionicons name="navigate" size={20} color="white" />
            <Text style={styles.planButtonText}>Plan Trip</Text>
          </>
        )}
      </TouchableOpacity>

      {tripResults.length > 0 && (
        <FlatList
          data={tripResults}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderTripOption}
          contentContainerStyle={styles.tripsList}
          ListHeaderComponent={
            <Text style={styles.resultsHeader}>
              {tripResults.length} route{tripResults.length !== 1 ? 's' : ''} found
            </Text>
          }
        />
      )}

      {renderLocationSearch(true)}
      {renderLocationSearch(false)}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: 'white',
    paddingTop: 50,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  inputSection: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  locationInput: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  locationTextContainer: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  locationValue: {
    fontSize: 16,
    color: '#333',
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginHorizontal: 16,
  },
  planButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
  },
  planButtonDisabled: {
    backgroundColor: '#ccc',
  },
  planButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  searchModal: {
    flex: 1,
    backgroundColor: 'white',
  },
  searchHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  searchInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    marginLeft: 12,
  },
  loadingContainer: {
    padding: 20,
    alignItems: 'center',
  },
  searchResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  searchResultIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  searchResultText: {
    flex: 1,
  },
  searchResultName: {
    fontSize: 16,
    color: '#333',
    marginBottom: 2,
  },
  searchResultAddress: {
    fontSize: 14,
    color: '#666',
  },
  tripsList: {
    paddingHorizontal: 20,
  },
  resultsHeader: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  tripOption: {
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
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  tripTime: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  tripDuration: {
    fontSize: 14,
    color: '#666',
  },
  segmentsContainer: {
    gap: 8,
  },
  segmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    color: '#333',
  },
  tripFooter: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  carbonText: {
    fontSize: 12,
    color: '#666',
  },
});