import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { BackHandler } from 'react-native';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Animated,
  Dimensions,
  ScrollView,
  Image,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { API_ENDPOINTS, fetchAPI } from './src/lib/api';
import { Stop, BikeStation, DepartureResponse } from './src/types';
import { StopMarker } from './src/components/StopMarker';
import { BikeMarker } from './src/components/BikeMarker';
import { DeparturesModal } from './src/components/DeparturesModal';
import { 
  useFonts,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://3000.pluraldan.link';
import { SplashScreen } from './src/components/SplashScreen';

MapboxGL.setAccessToken('pk.eyJ1IjoiaXNpdHpvZSIsImEiOiJjbWU1Z2NkNWQwaXdoMmpzYW9lYWFtZTd3In0.kigZZwCbecxw-WET2cos-A');
MapboxGL.setTelemetryEnabled(false);
MapboxGL.setWellKnownTileServer('Mapbox');

const renderRouteIcon = (route: any, size: number = 20, providers: any = {}) => {
  const lineId = route.route_short_name;
  const routeFeedId = route.feed_onestop_id || route.feed_id;
  const provider = providers[routeFeedId];
  
  if (!provider) {
    let bgColor = route.route_color || '#6b46c1';
    if (bgColor.length === 9 && bgColor.endsWith('FF')) {
      bgColor = bgColor.slice(0, 7);
    }
    
    return (
      <View 
        style={{
          width: size,
          height: size,
          backgroundColor: bgColor,
          borderRadius: 4,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: 'white', fontSize: size * 0.5, fontWeight: 'bold' }}>
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
          source={{ uri: iconUri }}
          style={{ width: size, height: size }}
          resizeMode="contain"
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
  const hasLongNames = provider?.['long_line_names'];
  
  return (
    <View 
      style={{
        width: hasLongNames ? undefined : size,
        minWidth: hasLongNames ? size : undefined,
        height: size,
        backgroundColor,
        borderRadius: borderRadius === '50%' ? size / 2 : borderRadius,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      }}
    >
      <Text 
        style={{ 
          color: textColor, 
          fontSize: size * 0.4, 
          fontWeight: 'bold',
          textAlign: 'center',
        }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {lineId}
      </Text>
    </View>
  );
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

function MainApp() {
  const [fontsLoaded] = useFonts({
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  const [showSplash, setShowSplash] = useState(true);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState<string>('undetermined');
  const [stops, setStops] = useState<Stop[]>([]);
  const [bikeStations, setBikeStations] = useState<BikeStation[]>([]);
  const [mapStops, setMapStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [departures, setDepartures] = useState<DepartureResponse | null>(null);
  const [departuresLoading, setDeparturesLoading] = useState(false);
  const [mapCenter, setMapCenter] = useState<[number, number]>([-0.3774, 39.4698]);
  const [zoomLevel, setZoomLevel] = useState(14);
  const [displayZoomLevel, setDisplayZoomLevel] = useState(14);
  const [mapInitialized, setMapInitialized] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [providers, setProviders] = useState<any>({});
  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAddress, setCurrentAddress] = useState<string>('Valencia, Spain');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [showBottomBar, setShowBottomBar] = useState(true);
  const [showDeparturesModal, setShowDeparturesModal] = useState(false);
  
  const updateTimer = useRef<NodeJS.Timeout | null>(null);
  const geocodeTimer = useRef<NodeJS.Timeout | null>(null);
  
  const drawerAnimation = useRef(new Animated.Value(0)).current;
  const locationButtonWidth = useRef(new Animated.Value(1)).current;
  const locationButtonOpacity = useRef(new Animated.Value(1)).current;
  const searchIconOpacity = useRef(new Animated.Value(0)).current;
  
  const stopsCache = useRef<Map<string, { stops: Stop[], timestamp: number }>>(new Map());
  const CACHE_DURATION = 5 * 60 * 1000;
  const GRID_SIZE = 0.01;
  
  const reverseGeocode = useCallback(async (coords: [number, number]) => {
    const [lon, lat] = coords;
    
    if (locationPermission === 'granted') {
      try {
        const results = await Location.reverseGeocodeAsync({
          latitude: lat,
          longitude: lon,
        });
        
        if (results && results.length > 0) {
          const result = results[0];
          let address = '';
          
          if (result.street) {
            if (result.streetNumber) {
              address = `${result.street}, ${result.streetNumber}`;
            } else {
              address = result.street;
            }
          } else if (result.name) {
            address = result.name;
          }
          
          if (result.city) {
            address = address ? `${address}, ${result.city}` : result.city;
          } else if (result.district) {
            address = address ? `${address}, ${result.district}` : result.district;
          }
          
          if (!address && result.region) {
            address = result.region;
          }
          
          if (address) {
            setCurrentAddress(address);
            return;
          }
        }
      } catch (error) {
        console.error('Expo location reverse geocoding failed, trying Nominatim:', error);
      }
    }
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=es`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.address) {
          const addr = data.address;
          let address = '';
          
          if (addr.road) {
            if (addr.house_number) {
              address = `${addr.road}, ${addr.house_number}`;
            } else {
              address = addr.road;
            }
          } else if (addr.pedestrian) {
            address = addr.pedestrian;
          } else if (addr.suburb) {
            address = addr.suburb;
          }
          
          if (addr.city) {
            address = address ? `${address}, ${addr.city}` : addr.city;
          } else if (addr.town) {
            address = address ? `${address}, ${addr.town}` : addr.town;
          } else if (addr.village) {
            address = address ? `${address}, ${addr.village}` : addr.village;
          }
          
          if (!address && data.display_name) {
            address = data.display_name.split(',').slice(0, 2).join(', ');
          }
          
          console.log('Nominatim address:', address, 'house_number:', addr.house_number);
          setCurrentAddress(address || 'Unknown location');
        }
      }
    } catch (error) {
      console.error('Nominatim reverse geocoding error:', error);
    }
  }, [locationPermission]);

  const loadProviders = useCallback(async () => {
    try {
      const response = await fetch(`${process.env.EXPO_PUBLIC_API_URL}/available_providers.json`);
      const data = await response.json();
      const providersData = data.providers || [];
      const providersMap = providersData.reduce((acc: any, provider: any) => {
        acc[provider.onestop_id] = provider;
        return acc;
      }, {});
      setProviders(providersMap);
      
      const imagesToPreload: string[] = [];
      providersData.forEach((provider: any) => {
        if (provider.logo) {
          const logoUri = provider.logo.startsWith('/')
            ? `${API_BASE_URL}${provider.logo}`
            : provider.logo;
          imagesToPreload.push(logoUri);
        }
        if (provider['lines-icons']) {
          Object.values(provider['lines-icons']).forEach((icon: any) => {
            const iconUri = icon.startsWith('/')
              ? `${API_BASE_URL}${icon}`
              : icon;
            imagesToPreload.push(iconUri);
          });
        }
      });
      
      if (imagesToPreload.length > 0) {
        console.log('Prefetching', imagesToPreload.length, 'images...');
        await Promise.all(
          imagesToPreload.map(uri => 
            Image.prefetch(uri).catch(err => 
              console.log('Failed to prefetch:', uri, err)
            )
          )
        );
        console.log('Image prefetching complete');
      }
    } catch (error) {
      console.error('Error loading providers:', error);
    }
  }, []);
  const mapRef = useRef<MapboxGL.MapView>(null);
  const cameraRef = useRef<MapboxGL.Camera>(null);

  useEffect(() => {
    return () => {
      if (updateTimer.current) {
        clearTimeout(updateTimer.current);
      }
      if (geocodeTimer.current) {
        clearTimeout(geocodeTimer.current);
      }
    };
  }, []);


  useEffect(() => {
    if (!mapInitialized) {
      AsyncStorage.getItem('mapViewState').then((saved) => {
        if (saved) {
          try {
            const state = JSON.parse(saved);
            if (state.longitude && state.latitude && !isNaN(state.longitude) && !isNaN(state.latitude)) {
              const coords: [number, number] = [state.longitude, state.latitude];
              const savedZoom = state.zoom || 14;
              setMapCenter(coords);
              setZoomLevel(savedZoom);
              setDisplayZoomLevel(savedZoom);
            }
          } catch (error) {
            console.error('Error parsing saved map state:', error);
          }
        }
        setMapInitialized(true);
      });
    }
  }, [mapInitialized]);

  useEffect(() => {
    (async () => {
      await loadProviders();
      let { status } = await Location.getForegroundPermissionsAsync();
      setLocationPermission(status);
      if (status === 'granted') {
        try {
          const location = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setLocation(location);
        } catch (error) {
          console.error('Error getting initial location:', error);
        }
      }
    })();
  }, [loadProviders]);


  const fetchTransportData = useCallback(async (center: [number, number]) => {
    try {
      const response = await fetchAPI(
        `${API_ENDPOINTS.transport}?lat=${center[1]}&lon=${center[0]}&radius=500`
      );
      setStops(response.stops || []);
    } catch (error) {
      console.error('Error fetching transport data:', error);
    }
  }, []);

  const fetchBikeData = useCallback(async (center: [number, number]) => {
    if (zoomLevel < 13) {
      setBikeStations([]);
      return;
    }
    
    try {
      const response = await fetchAPI(
        `${API_ENDPOINTS.bikes}?lat=${center[1]}&lon=${center[0]}&radius=1000`
      );
      setBikeStations(response.stops || []);
    } catch (error) {
      console.error('Error fetching bike data:', error);
    }
  }, [zoomLevel]);

  const fetchMapStops = useCallback(async (center: [number, number]) => {
    try {
      const gridX = Math.floor(center[0] / GRID_SIZE) * GRID_SIZE;
      const gridY = Math.floor(center[1] / GRID_SIZE) * GRID_SIZE;
      const cacheKey = `${gridX.toFixed(3)},${gridY.toFixed(3)}`;
      
      const cached = stopsCache.current.get(cacheKey);
      const now = Date.now();
      
      if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        
        setMapStops((prevStops) => {
          const existingIds = new Set(prevStops.map(s => s.stop_id));
          const newStops = cached.stops.filter(s => !existingIds.has(s.stop_id));
          return [...prevStops, ...newStops];
        });
        return;
      }
      
      const url = `${API_ENDPOINTS.stops}?lat=${center[1]}&lon=${center[0]}&radius=2000`;
      const response = await fetchAPI(url);
      
      if (response.features) {
        const stops = response.features.map((feature: any) => ({
          stop_id: feature.properties.stop_id,
          stop_name: feature.properties.stop_name,
          stop_lat: feature.geometry.coordinates[1],
          stop_lon: feature.geometry.coordinates[0],
          routes: feature.properties.routes,
          feed_onestop_id: feature.properties.feed_onestop_id,
        }));
        
        stopsCache.current.set(cacheKey, { stops, timestamp: now });
        
        if (stopsCache.current.size > 50) {
          const sortedEntries = Array.from(stopsCache.current.entries())
            .sort((a, b) => a[1].timestamp - b[1].timestamp);
          stopsCache.current = new Map(sortedEntries.slice(-40));
        }
        
        setMapStops((prevStops) => {
          const existingIds = new Set(prevStops.map(s => s.stop_id));
          // @ts-expect-error - error expected
          const newStops = stops.filter(s => !existingIds.has(s.stop_id));
          return [...prevStops, ...newStops];
        });
      }
    } catch (error) {
      console.error('Error fetching map stops:', error);
    }
  }, []);

  const stopsGeoJSON = useMemo(() => {
    const features = mapStops.map((stop) => ({
      type: 'Feature' as const,
      id: stop.stop_id,
      geometry: {
        type: 'Point' as const,
        coordinates: [stop.stop_lon, stop.stop_lat],
      },
      properties: {
        stop_id: stop.stop_id,
        stop_name: stop.stop_name,
        routes: stop.routes,
        feed_onestop_id: stop.feed_onestop_id,
      },
    }));

    const geoJSON = {
      type: 'FeatureCollection' as const,
      features,
    };
    return geoJSON;
  }, [mapStops]);

  const handleMapChange = useCallback(async (event: any) => {
    if (!mapInitialized || !mapReady) {
      return;
    }
    
    if (!event) {
      return;
    }
    
    let longitude: number | undefined;
    let latitude: number | undefined;
    let zoom: number | undefined;
    
    if (event.geometry && event.geometry.coordinates) {
      [longitude, latitude] = event.geometry.coordinates;
      zoom = event.properties?.zoomLevel;
    } else if (event.properties) {
      longitude = event.properties.longitude;
      latitude = event.properties.latitude;
      zoom = event.properties.zoomLevel;
    }
    
    if (typeof longitude !== 'number' || typeof latitude !== 'number' || !isFinite(longitude) || !isFinite(latitude)) {
      return;
    }
    
    const center: [number, number] = [longitude, latitude];
    fetchTransportData(center);
    fetchBikeData(center);
    fetchMapStops(center);
    
    if (!isAnimating) {
      const currentLat = mapCenter[1];
      const currentLng = mapCenter[0];
      const latDiff = Math.abs(currentLat - latitude);
      const lngDiff = Math.abs(currentLng - longitude);
      const zoomDiff = Math.abs(zoomLevel - (zoom || zoomLevel));
      
      if (latDiff > 0.0001 || lngDiff > 0.0001 || zoomDiff > 0.1) {
        setMapCenter(center);
        if (typeof zoom === 'number') {
          setZoomLevel(zoom);
        }
      } else {
      }
    } else {
    }
  }, [fetchTransportData, fetchBikeData, fetchMapStops, mapInitialized, mapReady]);

  useEffect(() => {
    if (!selectedStop) {
      setShowDeparturesModal(false);
      return;
    }
    
    setShowDeparturesModal(true);
    setDeparturesLoading(true);
    setDepartures(null);
    
    const feedOnestopId = selectedStop.feed_onestop_id;
    fetchAPI(
      `${API_ENDPOINTS.departuresRealtime}?stop_id=${selectedStop.stop_id}&feed_onestop_id=${feedOnestopId}`
    )
      .then(setDepartures)
      .catch(console.error)
      .finally(() => setDeparturesLoading(false));
  }, [selectedStop]);


  useEffect(() => {
    if (!showSplash && mapInitialized) {
      fetchTransportData(mapCenter);
      fetchBikeData(mapCenter);
      setLoading(false);
      
      if (zoomLevel >= 15) {
        fetchMapStops(mapCenter);
      }
      
      reverseGeocode(mapCenter);
    }
  }, [showSplash, mapInitialized, mapCenter]);

  const openDrawer = () => {
    setIsDrawerOpen(true);
    setShowBottomBar(false);
    
    Animated.parallel([
      Animated.spring(drawerAnimation, {
        toValue: 1,
        useNativeDriver: false,
        tension: 50,
        friction: 9,
      }),
      Animated.timing(locationButtonWidth, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }),
      Animated.timing(locationButtonOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(searchIconOpacity, {
        toValue: 1,
        duration: 200,
        delay: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const closeDrawer = useCallback(() => {
    setShowBottomBar(true);
    
    setTimeout(() => {
      Animated.parallel([
        Animated.spring(drawerAnimation, {
          toValue: 0,
          useNativeDriver: false,
          tension: 50,
          friction: 9,
        }),
        Animated.timing(locationButtonWidth, {
          toValue: 1,
          duration: 300,
          useNativeDriver: false,
        }),
        Animated.timing(searchIconOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(locationButtonOpacity, {
          toValue: 1,
          duration: 200,
          delay: 100,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsDrawerOpen(false);
      });
    }, 100);
  }, [drawerAnimation, locationButtonWidth, searchIconOpacity, locationButtonOpacity]);

  useEffect(() => {
    if (isDrawerOpen) {
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        closeDrawer();
        return true;
      });
      return () => backHandler.remove();
    }
  }, [isDrawerOpen, closeDrawer]);

  const handleLocationPress = async () => {
    let currentStatus = locationPermission;
    if (locationPermission !== 'granted') {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(status);
      currentStatus = status;
      
      if (status !== 'granted') {
        Alert.alert('Location Permission', 'Please enable the location permission (and turn on your location) for these services to work');
        return;
      }
    }
    
    try {
      const locationPromise = Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,
        distanceInterval: 0,
      });
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Location timeout')), 10000)
      );
      
      const newLocation = await Promise.race([locationPromise, timeoutPromise]) as Location.LocationObject;
      
      setLocation(newLocation);
      const coords: [number, number] = [newLocation.coords.longitude, newLocation.coords.latitude];
      if (cameraRef.current) {
        setIsAnimating(true);
        
        setMapCenter(coords);
        setZoomLevel(17);
        setDisplayZoomLevel(17);
        
        cameraRef.current.setCamera({
          centerCoordinate: coords,
          zoomLevel: 17,
          animationDuration: 1000,
        });
        
        fetchTransportData(coords);
        fetchBikeData(coords);
        if (displayZoomLevel >= 15) {
          fetchMapStops(coords);
        }
        
        setTimeout(() => {
          setIsAnimating(false);
        }, 1100);
      } else {
        setIsAnimating(true);
        setMapCenter(coords);
        setZoomLevel(17);
        setDisplayZoomLevel(17);
        
        setTimeout(() => {
          setIsAnimating(false);
        }, 1100);
      }
    } catch (error: any) {
      console.error('Error getting location:', error);
      
      if (error.message === 'Location timeout') {
        Alert.alert(
          'Location Timeout',
          'Unable to get your location. Please ensure Location Services are enabled and try again.'
        );
      } else if (error.code === 'E_LOCATION_SERVICES_DISABLED') {
        Alert.alert(
          'Location Services Disabled',
          'Please enable Location Services in your device settings.'
        );
      } else {
        Alert.alert(
          'Location Error',
          'Failed to get current location. Please try again.'
        );
      }
    }
  };

  if (!fontsLoaded) {
    return null;
  }
  
  return (
    <View style={styles.container}>
      {showSplash && (
        <SplashScreen onFinish={() => {
              setShowSplash(false);
        }} />
      )}
      {!showSplash && mapInitialized && (
        <>
          <View style={styles.mapContainer}>
            <MapboxGL.MapView 
            ref={mapRef}
            style={styles.map}
            styleURL="mapbox://styles/isitzoe/cmeia1qhk000801qw9z2l45cr"
            zoomEnabled={true}
            scrollEnabled={true}
            
            pitchEnabled={false}
            rotateEnabled={false}
            onMapIdle={handleMapChange}
            onCameraChanged={(state) => {
              if (state?.properties?.zoom) {
                setDisplayZoomLevel(state.properties.zoom);
              }
              
              if (state?.properties?.center) {
                const center = state.properties.center;
                if (Array.isArray(center) && center.length === 2) {
                  setCurrentAddress('Finding this place...');
                  
                  if (updateTimer.current) {
                    clearTimeout(updateTimer.current);
                  }
                  if (geocodeTimer.current) {
                    clearTimeout(geocodeTimer.current);
                  }
                  
                  updateTimer.current = setTimeout(() => {
                    fetchTransportData(center as [number, number]);
                    fetchBikeData(center as [number, number]);
                    
                    if (displayZoomLevel >= 15) {
                      fetchMapStops(center as [number, number]);
                      
                      const offsets = [
                        [-GRID_SIZE, 0], [GRID_SIZE, 0],
                        [0, -GRID_SIZE], [0, GRID_SIZE],
                      ];
                      
                      offsets.forEach(([dx, dy]) => {
                        const adjacentCenter: [number, number] = [
                          (center as [number, number])[0] + dx,
                          (center as [number, number])[1] + dy
                        ];
                        setTimeout(() => fetchMapStops(adjacentCenter), 500);
                      });
                    }
                  }, 300);
                  
                  geocodeTimer.current = setTimeout(() => {
                    reverseGeocode(center as [number, number]);
                    
                    AsyncStorage.setItem('mapViewState', JSON.stringify({
                      latitude: (center as [number, number])[1],
                      longitude: (center as [number, number])[0],
                      zoom: displayZoomLevel,
                    }));
                  }, 800);
                }
              }
            }}
            onDidFinishLoadingMap={() => {
              setTimeout(() => {
                setMapReady(true);
              }, 500);
            }}
            logoEnabled={false}
            attributionEnabled={false}
            compassEnabled={false}
            scaleBarEnabled={false}
          >
            {mapInitialized && mapCenter[0] !== undefined && mapCenter[1] !== undefined && (
              <MapboxGL.Camera
                ref={cameraRef}
                centerCoordinate={mapCenter}
                zoomLevel={zoomLevel}
                animationDuration={isAnimating ? 1000 : 0}
              />
            )}
            
            {location && (
              <MapboxGL.PointAnnotation
                id="userLocation"
                coordinate={[location.coords.longitude, location.coords.latitude]}
              >
                <View style={styles.userMarker} />
              </MapboxGL.PointAnnotation>
            )}

            {displayZoomLevel >= 15 && mapStops.map((stop) => {
              if (typeof stop.stop_lon !== 'number' || typeof stop.stop_lat !== 'number') {
                return null;
              }
              return (
                <MapboxGL.PointAnnotation
                  key={`stop-${stop.stop_id}`}
                  id={`stop-${stop.stop_id}`}
                  coordinate={[stop.stop_lon, stop.stop_lat]}
                  onSelected={() => setSelectedStop(stop)}
                >
                  <StopMarker stop={stop} providerConfig={providers} />
                </MapboxGL.PointAnnotation>
              );
            })}

            {displayZoomLevel >= 13 && bikeStations.map((station) => {
              if (typeof station.lng !== 'number' || typeof station.lat !== 'number') {
                return null;
              }
              return (
                <MapboxGL.PointAnnotation
                  key={`bike-${station.id}`}
                  id={`bike-${station.id}`}
                  coordinate={[station.lng, station.lat]}
                >
                  <BikeMarker station={station} />
                </MapboxGL.PointAnnotation>
              );
            })}
          </MapboxGL.MapView>

          <View style={styles.centerMarkerContainer} pointerEvents="none">
            <View style={[
              styles.centerMarker,
              selectedStop ? styles.centerMarkerLarge : styles.centerMarkerSmall
            ]} />
          </View>
          </View>

          {showBottomBar && (
            <View style={styles.bottomBar}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={openDrawer}
                style={styles.locationCard}
              >
                <Text style={styles.locationText}>{currentAddress}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.locationButton,
                  locationPermission === 'denied' && styles.locationButtonDisabled
                ]}
                onPress={handleLocationPress}
                disabled={locationPermission === 'denied'}
              >
                <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <Path 
                    d="M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" 
                    stroke="#5B5D64FF" 
                    strokeWidth="2"
                  />
                  <Path 
                    d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" 
                    fill="#747482FF"
                  />
                  <Path 
                    d="M12 2v2m0 16v2M2 12h2m16 0h2" 
                    stroke="#5B5D64FF" 
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </Svg>
              </TouchableOpacity>
            </View>
          )}

          <Animated.View 
            style={[
              styles.drawer,
              {
                transform: [{
                  translateY: drawerAnimation.interpolate({
                    inputRange: [0, 1],
                    outputRange: [screenHeight, 0],
                  })
                }],
                height: screenHeight * 0.7,
              }
            ]}
            pointerEvents={isDrawerOpen ? 'auto' : 'none'}
          >
            <View style={styles.drawerHeader}>
              <View style={[styles.bottomBar, styles.drawerTopBar]}>
                <TouchableOpacity
                activeOpacity={0.9}
                style={[
                  styles.locationCard,
                  {
                    flex: 1,
                  }
                ]}
              >
                <Animated.View
                  style={{
                    position: 'absolute',
                    left: 20,
                    top: '125%',
                    marginTop: -10,
                    opacity: searchIconOpacity,
                  }}
                >
                  <Svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <Path
                      d="M9 17C13.4183 17 17 13.4183 17 9C17 4.58172 13.4183 1 9 1C4.58172 1 1 4.58172 1 9C1 13.4183 4.58172 17 9 17Z"
                      stroke="#6B7280"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <Path
                      d="M19 19L14.65 14.65"
                      stroke="#6B7280"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </Svg>
                </Animated.View>
                <Text style={[
                  styles.locationText,
                  styles.locationTextDrawer
                ]}>
                  Where do we start your trip?
                </Text>
              </TouchableOpacity>
              
              <Animated.View
                style={[
                  {
                    width: locationButtonWidth.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 48],
                    }),
                    overflow: 'hidden',
                  }
                ]}
              >
                <TouchableOpacity
                  style={[
                    styles.locationButton,
                    locationPermission === 'denied' && styles.locationButtonDisabled
                  ]}
                  onPress={handleLocationPress}
                  disabled={locationPermission === 'denied'}
                >
                  <Animated.View style={{ opacity: locationButtonOpacity }}>
                    <Svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <Path 
                        d="M12 12m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0" 
                        stroke="#5B5D64FF" 
                        strokeWidth="2"
                      />
                      <Path 
                        d="M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0 -6 0" 
                        fill="#747482FF"
                      />
                      <Path 
                        d="M12 2v2m0 16v2M2 12h2m16 0h2" 
                        stroke="#5B5D64FF" 
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Animated.View>
                </TouchableOpacity>
              </Animated.View>
            </View>
            </View>
            
            <ScrollView 
              style={styles.drawerContent} 
              showsVerticalScrollIndicator={false} 
              contentContainerStyle={{paddingTop: 100}}
              bounces={true}
              onScroll={(event) => {
                const offsetY = event.nativeEvent.contentOffset.y;
                if (offsetY < -50) {
                  closeDrawer();
                }
              }}
              scrollEventThrottle={16}
            >
              <View style={styles.stopsContainer}>
                {stops.length > 0 ? (
                  stops.map((stop, index) => (
                    <TouchableOpacity
                      key={`${stop.stop_id}-${index}`}
                      style={styles.stopItem}
                      onPress={() => {
                        setSelectedStop(stop);
                        closeDrawer();
                      }}
                    >
                      <View style={styles.stopInfo}>
                        <Text style={styles.stopName}>{stop.stop_name}</Text>
                        {stop.distance && (
                          <Text style={styles.stopDistance}>
                            {stop.distance < 1000 
                              ? `${Math.round(stop.distance)}m`
                              : `${(stop.distance / 1000).toFixed(1)}km`
                            }
                          </Text>
                        )}
                      </View>
                      {stop.routes && stop.routes.length > 0 && (
                        <View style={styles.stopRoutes}>
                          {stop.routes.slice(0, 3).map((route, routeIndex) => (
                            <View key={`${route.route_id}-${routeIndex}`} style={styles.routeIconContainer}>
                              {renderRouteIcon(route, 24, providers)}
                            </View>
                          ))}
                        </View>
                      )}
                    </TouchableOpacity>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No stops found nearby</Text>
                    <Text style={styles.emptyStateSubtext}>Try moving the map to a different location</Text>
                  </View>
                )}
              </View>
            </ScrollView>
          </Animated.View>
          
          {isDrawerOpen && (
            <TouchableOpacity
              style={styles.overlay}
              activeOpacity={1}
              onPress={closeDrawer}
            />
          )}
          
          <DeparturesModal
            stop={selectedStop}
            departures={departures}
            loading={departuresLoading}
            isVisible={showDeparturesModal}
            onClose={() => setSelectedStop(null)}
            providerConfig={providers}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  mapContainer: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  centerMarkerContainer: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -7 }, { translateY: -7 }],
    zIndex: 1,
    elevation: 0,
  },
  centerMarker: {
    backgroundColor: '#9ca3af',
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 0,
  },
  centerMarkerSmall: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  centerMarkerLarge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 4,
  },
  userMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#4776A9FF',
    borderWidth: 3,
    borderColor: 'white',
  },
  bikeMarker: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'white',
  },
  bikeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  bottomBar: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  locationCard: {
    backgroundColor: 'white',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    flex: 1,
    shadowColor: '#6F7081FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#D4D5EBFF',
  },
  locationText: {
    color: '#424349FF',
    fontSize: 15,
    fontFamily: 'Figtree_600SemiBold',
    letterSpacing: -0.1,
    textAlign: 'center',
  },
  locationTextDrawer: {
    textAlign: 'center',
    color: '#6B7280',
    fontFamily: 'Figtree_500Medium',
    width: '100%',
  },
  locationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#6F7081FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    borderWidth: 1.5,
    borderColor: '#D4D5EBFF',
  },
  locationButtonDisabled: {
    opacity: 0.5,
  },
  loader: {
    marginTop: 20,
  },
  stopItem: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  stopInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  stopName: {
    fontSize: 16,
    color: '#0f172a',
    fontWeight: '600',
    flex: 1,
  },
  stopDistance: {
    fontSize: 14,
    color: '#64748b',
    marginRight: 16,
  },
  stopRoutes: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 4,
  },
  routeIconContainer: {
    marginRight: 2,
  },
  routeBadge: {
    backgroundColor: '#7c3aed',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 'bold',
  },
  departuresCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  departuresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0f172a',
    marginBottom: 4,
  },
  departuresTime: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 12,
  },
  departuresList: {
    gap: 8,
  },
  departureItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  departureRoute: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  routeIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 40,
    alignItems: 'center',
  },
  routeNumber: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  routeName: {
    fontSize: 14,
    color: '#334155',
    flex: 1,
  },
  departureTime: {
    alignItems: 'flex-end',
  },
  departureTimeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0f172a',
  },
  minutesText: {
    fontSize: 12,
    color: '#64748b',
  },
  drawer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 25,
    zIndex: 1000,
  },
  drawerContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  drawerHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    backgroundColor: 'white',
    zIndex: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  drawerTopBar: {
    position: 'absolute',
    top: 20,
    left: 15,
    right: 5,
    bottom: 'auto',
  },
  stopsContainer: {
    paddingBottom: 40,
  },
  emptyState: {
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 18,
    fontFamily: 'Figtree_600SemiBold',
    color: '#374151',
    marginBottom: 8,
  },
  emptyStateSubtext: {
    fontSize: 14,
    fontFamily: 'Figtree_400Regular',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
});

function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <MainApp />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default App;