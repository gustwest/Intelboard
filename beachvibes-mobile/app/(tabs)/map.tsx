import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, TextInput, Dimensions, Animated, KeyboardAvoidingView, Platform, Image, PanResponder } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../src/theme/colors';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { api } from '../../src/api/client';
import { useRouter } from 'expo-router';
import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { BlurView } from 'expo-blur';

// ─── Map style types ──────────────────────────────────────────────────
type MapStyleType = 'dark' | 'light' | 'satellite';

const MAP_STYLES: { key: MapStyleType; label: string; icon: string }[] = [
  { key: 'dark',      label: 'Mörk',      icon: 'moon' },
  { key: 'light',     label: 'Ljus',      icon: 'sunny' },
  { key: 'satellite', label: 'Satellit',  icon: 'earth' },
];

// ─── Dark map style for Google Maps (Android) ──────────────────────────
// Matches CARTO dark_all tiles (basemaps.cartocdn.com/dark_all) used in web app.
// Neutral black/grey palette, no blue tinting.
const DARK_MAP_STYLE = [
  // Base geometry: near-black
  { elementType: 'geometry', stylers: [{ color: '#1a1a2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#757575' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#212121' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  // Admin boundaries
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#434343' }] },
  { featureType: 'administrative.country', elementType: 'labels.text.fill', stylers: [{ color: '#9e9e9e' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#bdbdbd' }] },
  // Landscape
  { featureType: 'landscape', elementType: 'geometry.fill', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry.stroke', stylers: [{ color: '#2c2c3e' }] },
  // POI
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#1e1e32' }] },
  { featureType: 'poi', elementType: 'labels.text.fill', stylers: [{ color: '#606060' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ color: '#181a29' }] },
  { featureType: 'poi.park', elementType: 'labels.text.fill', stylers: [{ color: '#4a6a4a' }] },
  // Roads
  { featureType: 'road', elementType: 'geometry.fill', stylers: [{ color: '#2c2c3e' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212121' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#333348' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3c3c52' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#1a1a2e' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#4e4e68' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#616161' }] },
  // Transit
  { featureType: 'transit', elementType: 'labels.text.fill', stylers: [{ color: '#606060' }] },
  { featureType: 'transit.line', elementType: 'geometry', stylers: [{ color: '#2a2a3e' }] },
  { featureType: 'transit.station', elementType: 'geometry', stylers: [{ color: '#222238' }] },
  // Water: deep dark
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0d0d1a' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#3d3d3d' }] },
];

// ─── Photo-circle Marker (matches web createPhotoMarker) ─────────────────
// Circle with coloured border + photo/emoji inside. dateBadge sits below.
// Container is deliberately oversized so badges & shadows don't clip.
const MARKER_SZ = 40;  // matches web's 44px minus mobile density offset

function ImageMarker({ coordinate, onPress, imgUrl, iconBg, emoji, isFocused, isCluster, clusterCount, dateBadge, size }: {
  coordinate: { latitude: number; longitude: number };
  onPress: () => void;
  imgUrl: string | null | undefined;
  iconBg: string;
  emoji: string;
  isFocused: boolean;
  isCluster: boolean;
  clusterCount: number;
  dateBadge?: string;
  size?: number;
}) {
  const [imageLoaded, setImageLoaded] = useState(!imgUrl);
  const sz = size || MARKER_SZ;
  const innerSz = sz - 4; // subtract border

  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      tracksViewChanges={!imageLoaded}
      anchor={{ x: 0.5, y: 0.5 }}
    >
      {/* Oversized container — prevents Android clipping */}
      <View style={{ width: sz + 24, height: sz + 24, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }}>
        {/* Focus ring */}
        {isFocused && (
          <View style={{ position: 'absolute', width: sz + 8, height: sz + 8, borderRadius: (sz + 8) / 2, borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' }} />
        )}
        {/* Main circle */}
        <View style={{
          width: sz, height: sz, borderRadius: sz / 2,
          borderWidth: 2.5, borderColor: iconBg,
          backgroundColor: 'rgba(15,15,30,0.85)',
          overflow: 'hidden',
        }}>
          {imgUrl ? (
            <Image
              source={{ uri: imgUrl }}
              style={{ width: innerSz, height: innerSz, borderRadius: innerSz / 2 }}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageLoaded(true)}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: sz * 0.42 }}>{emoji}</Text>
            </View>
          )}
        </View>
        {/* Cluster badge — top right */}
        {isCluster && clusterCount > 0 && (
          <View style={{
            position: 'absolute', top: 2, right: 2,
            backgroundColor: '#ef4444', borderRadius: 9, minWidth: 18, height: 18,
            paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center',
            borderWidth: 1.5, borderColor: '#fff',
          }}>
            <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>{clusterCount}</Text>
          </View>
        )}
        {/* Date badge — centered below circle */}
        {dateBadge && (
          <View style={{
            position: 'absolute', bottom: 0,
            backgroundColor: iconBg, borderRadius: 6,
            paddingHorizontal: 5, paddingVertical: 1,
          }}>
            <Text style={{ color: '#fff', fontSize: 8, fontWeight: '800', letterSpacing: 0.3 }}>{dateBadge}</Text>
          </View>
        )}
      </View>
    </Marker>
  );
}

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get('window');
const SHEET_HANDLE_HEIGHT = 40; 
const PANEL_COLLAPSED = 200;
const PANEL_EXPANDED = SCREEN_H * 0.7;

/** Format "2025-05-10" → "10 maj" for marker date badges */
function shortDate(dateStr: string): string {
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });
  } catch { return ''; }
}

interface MapData {
  courts: any[];
  clubs: any[];
  events: any[];
  tournaments: any[];
  groups: any[];
}

const FILTERS = [
  { key: 'courts', label: 'Banor', emoji: '🏐' },
  { key: 'clubs', label: 'Klubbar', emoji: '🏢' },
  { key: 'events', label: 'Spel', emoji: '📅' },
  { key: 'training', label: 'Träning', emoji: '💪' },
  { key: 'tournaments', label: 'Turneringar', emoji: '🏆' },
  { key: 'groups', label: 'Grupper', emoji: '👥' },
];

export default function MapScreen() {
  const router = useRouter();
  const [activeFilter, setActiveFilter] = useState('courts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapData, setMapData] = useState<MapData>({ courts: [], clubs: [], events: [], tournaments: [], groups: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleRegion, setVisibleRegion] = useState<Region | null>({
    latitude: 59.3293, longitude: 18.0686, latitudeDelta: 2, longitudeDelta: 2,
  });
  const [mapStyle, setMapStyle] = useState<MapStyleType>('dark');
  const [showMapStylePicker, setShowMapStylePicker] = useState(false);
  
  const mapRef = useRef<MapView>(null);
  const insets = useSafeAreaInsets();
  
  const panelHeight = useRef(new Animated.Value(PANEL_COLLAPSED)).current;
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [pinFocus, setPinFocus] = useState<any | null>(null);

  // ─── Viewport filter: only show items visible on screen ─────────────
  const handleRegionChange = useCallback((region: Region) => {
    setVisibleRegion(region);
  }, []);

  const isInViewport = useCallback((lat: number | null, lng: number | null): boolean => {
    if (!lat || !lng || !visibleRegion) return true; // show all if no region yet
    const buffer = 0.15; // 15% padding so edge items don't pop
    const latDelta = visibleRegion.latitudeDelta * (1 + buffer);
    const lngDelta = visibleRegion.longitudeDelta * (1 + buffer);
    const north = visibleRegion.latitude + latDelta / 2;
    const south = visibleRegion.latitude - latDelta / 2;
    const east = visibleRegion.longitude + lngDelta / 2;
    const west = visibleRegion.longitude - lngDelta / 2;
    return lat >= south && lat <= north && lng >= west && lng <= east;
  }, [visibleRegion]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderRelease: (e, gestureState) => {
        if (gestureState.dy > 30) {
          if (panelExpanded) {
            Animated.spring(panelHeight, { toValue: PANEL_COLLAPSED, useNativeDriver: false, friction: 8 }).start();
            setPanelExpanded(false);
            setPinFocus(null);
          }
        } else if (gestureState.dy < -30) {
          if (!panelExpanded) {
             Animated.spring(panelHeight, { toValue: PANEL_EXPANDED, useNativeDriver: false, friction: 8 }).start();
             setPanelExpanded(true);
          }
        } else {
          const toValue = panelExpanded ? PANEL_COLLAPSED : PANEL_EXPANDED;
          Animated.spring(panelHeight, { toValue, useNativeDriver: false, friction: 8 }).start();
          setPanelExpanded(!panelExpanded);
          if (panelExpanded) {
              setPinFocus(null);
          }
        }
      }
    })
  ).current;

  useEffect(() => {
    const fetchMap = async () => {
      try {
        const res = await api.get<MapData>('/api/mobile/map');
        setMapData(res);
      } catch (err: any) {
        console.error('Failed to fetch map data', err);
        setError(err?.message || 'Kunde inte ladda kartdata');
      } finally {
        setLoading(false);
      }
    };
    fetchMap();
  }, []);

  const togglePanel = () => {
    const toValue = panelExpanded ? PANEL_COLLAPSED : PANEL_EXPANDED;
    Animated.spring(panelHeight, { toValue, useNativeDriver: false, friction: 8 }).start();
    setPanelExpanded(!panelExpanded);
  };
  
  const openPanel = () => {
    if (!panelExpanded) {
      Animated.spring(panelHeight, { toValue: PANEL_EXPANDED, useNativeDriver: false, friction: 8 }).start();
      setPanelExpanded(true);
    }
  }

  const handleFilterChange = (key: string) => {
    setActiveFilter(key);
    setPinFocus(null);
  };

  const clearPinFocus = () => {
    setPinFocus(null);
  }

  const lastMarkerPressRef = useRef<number>(0);

  const handleMarkerPress = (item: any, type: string) => {
    lastMarkerPressRef.current = Date.now();
    if (type === 'court' || type === 'club') {
      setPinFocus({ ...item, kind: type });
      if (mapRef.current && item.latitude && item.longitude) {
        const shiftLat = 0.005; 
        mapRef.current.animateCamera({
          center: {
            latitude: item.latitude - shiftLat,
            longitude: item.longitude,
          },
          zoom: 14,
        }, { duration: 500 });
      }
      openPanel();
    } else if (type === 'event' || type === 'tournament') {
       if (item.courtId) {
          const c = mapData.courts.find(c => c.id === item.courtId);
          if (c) {
             handleMarkerPress(c, 'court');
             return;
          }
       }
       if (item.appUrl) {
           Linking.openURL(item.appUrl);
       } else {
           Linking.openURL(`https://beachvibes.app/${type}s/${item.id}`);
       }
    }
  };

  const initialRegion = {
    latitude: 59.3293,
    longitude: 18.0686,
    latitudeDelta: 2,
    longitudeDelta: 2,
  };


  /** Resolve lat/lng for any item (some use courtId as anchor). */
  const getItemLatLng = useCallback((item: any): { lat: number; lng: number } | null => {
    if (item.latitude && item.longitude) return { lat: item.latitude, lng: item.longitude };
    if (item.courtId) {
      const court = (mapData.courts || []).find((c: any) => c.id === item.courtId);
      if (court?.latitude && court?.longitude) return { lat: court.latitude, lng: court.longitude };
    }
    if (item.homeCourtId) {
      const court = (mapData.courts || []).find((c: any) => c.id === item.homeCourtId);
      if (court?.latitude && court?.longitude) return { lat: court.latitude, lng: court.longitude };
    }
    if (item.anchorCourtId) {
      const court = (mapData.courts || []).find((c: any) => c.id === item.anchorCourtId);
      if (court?.latitude && court?.longitude) return { lat: court.latitude, lng: court.longitude };
    }
    return null;
  }, [mapData.courts]);

  // Viewport-filtered counts — pills show only items visible on screen (matching web)
  const viewportFilter = useCallback((arr: any[]) => {
    if (!visibleRegion) return arr;
    return arr.filter(item => {
      const pos = getItemLatLng(item);
      return pos ? isInViewport(pos.lat, pos.lng) : false;
    });
  }, [visibleRegion, getItemLatLng, isInViewport]);

  const counts: Record<string, number> = {
    courts: viewportFilter(mapData.courts || []).length,
    clubs: viewportFilter(mapData.clubs || []).length,
    events: viewportFilter((mapData.events || []).filter(e => e.type !== 'Träning')).length,
    training: viewportFilter((mapData.events || []).filter(e => e.type === 'Träning')).length,
    tournaments: viewportFilter(mapData.tournaments || []).length,
    groups: viewportFilter(mapData.groups || []).length,
  };

  const getActiveItems = (): any[] => {
    const items = (() => {
      switch (activeFilter) {
        case 'courts': return mapData.courts || [];
        case 'events': return (mapData.events || []).filter(e => e.type !== 'Träning');
        case 'training': return (mapData.events || []).filter(e => e.type === 'Träning');
        case 'tournaments': return mapData.tournaments || [];
        case 'clubs': return mapData.clubs || [];
        case 'groups': return mapData.groups || [];
        default: return [];
      }
    })();

    // Filter by search query
    let filtered = items;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((item: any) => {
        const name = (item.name || item.title || '').toLowerCase();
        const sub = (item.courtName || item.clubName || item.region || item.organizerClub || '').toLowerCase();
        return name.includes(q) || sub.includes(q);
      });
    }

    // Filter to only items visible in current map viewport
    if (visibleRegion) {
      filtered = filtered.filter((item: any) => {
        const pos = getItemLatLng(item);
        if (!pos) return false;
        return isInViewport(pos.lat, pos.lng);
      });
    }

    return filtered;
  };



  const focusedEvents = useMemo(() => {
    if (!pinFocus) return [];
    const courtId = pinFocus.kind === 'court' ? pinFocus.id : pinFocus.courtId;
    const today = new Date().toISOString().split('T')[0];
    return (mapData.events || [])
      .filter(e => e.courtId === courtId && e.date >= today)
      .sort((a: any, b: any) => a.date.localeCompare(b.date));
  }, [pinFocus, mapData.events]);

  const focusedTournaments = useMemo(() => {
    if (!pinFocus) return [];
    const today = new Date().toISOString().split('T')[0];
    return (mapData.tournaments || [])
      .filter(t => {
        if (t.startDate < today) return false;
        if (pinFocus.kind === 'club') return t.linkedClubId === pinFocus.id;
        const club = (mapData.clubs || []).find(c => c.courtId === pinFocus.id);
        return club ? t.linkedClubId === club.id : false;
      })
      .sort((a: any, b: any) => a.startDate.localeCompare(b.startDate));
  }, [pinFocus, mapData.tournaments, mapData.clubs]);

  const focusedGroups = useMemo(() => {
    if (!pinFocus) return [];
    const courtId = pinFocus.kind === 'court' ? pinFocus.id : pinFocus.courtId;
    return (mapData.groups || []).filter(g => g.homeCourtId === courtId);
  }, [pinFocus, mapData.groups]);


  const renderListItem = (item: any, index: number) => {
    const isTournament = !!item.startDate;
    const isEvent = !!item.date;
    const isCourt = !!item.surface || (item.courts !== undefined);
    const isClub = !!item.clubName && !isCourt && !isEvent && !isTournament; // Basic heuristic

    if (isTournament) {
      const thumbUrl = item.imageUrl || item.clubLogoUrl;
      return (
        <TouchableOpacity key={item.id || index} style={s.listCard} activeOpacity={0.7}
          onPress={() => item.appUrl ? Linking.openURL(item.appUrl) : Linking.openURL(`https://beachvibes.app/tournaments/${item.id}`)}>
          <View style={s.listCardHeader}>
            {thumbUrl ? (
              <Image source={{ uri: thumbUrl }} style={s.listCardThumb} />
            ) : (
              <Text style={{ fontSize: 16 }}>🏆</Text>
            )}
            <Text style={s.listCardTitle} numberOfLines={1}>{item.name}</Text>
          </View>
          <Text style={s.listCardSub}>{item.organizerClub}</Text>
          <View style={s.listCardMeta}>
            <Text style={s.listCardMetaText}>📅 {item.startDate}{item.endDate && item.endDate !== item.startDate ? ` - ${item.endDate}` : ''}</Text>
            {item.level && <View style={s.levelBadge}><Text style={s.levelBadgeText}>{item.level}</Text></View>}
            {item.classes && <Text style={s.listCardMetaText}>{item.classes}</Text>}
          </View>
        </TouchableOpacity>
      );
    }

    if (isEvent) {
      const thumbUrl = item.imageUrl;
      return (
        <TouchableOpacity key={item.id || index} style={s.listCard} activeOpacity={0.7}
          onPress={() => router.push(`/event/${item.id}`)}>
          <View style={s.listCardHeader}>
            {thumbUrl ? (
              <Image source={{ uri: thumbUrl }} style={s.listCardThumb} />
            ) : (
              <View style={[s.dot, { backgroundColor: item.type === 'Träning' ? '#8b5cf6' : Colors.brandAccent }]} />
            )}
            <Text style={s.listCardTitle} numberOfLines={1}>{item.title}</Text>
          </View>
          <Text style={s.listCardSub}>📍 {item.courtName}</Text>
          <View style={s.listCardMeta}>
            <Text style={s.listCardMetaText}>📅 {item.date}</Text>
            {item.startTime && <Text style={s.listCardMetaText}>🕐 {item.startTime}</Text>}
            <Text style={[s.listCardMetaText, { color: Colors.brandPrimary }]}>{item.type}</Text>
          </View>
        </TouchableOpacity>
      );
    }

    if (isCourt || activeFilter === 'courts') {
        const thumbUrl = item.imageUrl || item.images?.[0]?.url;
        return (
          <TouchableOpacity key={item.id || index} style={s.listCard} activeOpacity={0.7}
            onPress={() => Linking.openURL(`https://beachvibes.app/courts/${item.id}`)}>
            <View style={s.listCardHeader}>
              {thumbUrl ? (
                <Image source={{ uri: thumbUrl }} style={s.listCardThumb} />
              ) : (
                <View style={[s.dot, { backgroundColor: Colors.brandPrimary }]} />
              )}
              <Text style={s.listCardTitle} numberOfLines={1}>{item.name}</Text>
              {item.eventCount > 0 && (
                <View style={s.eventBadge}>
                  <Text style={s.eventBadgeText}>{item.eventCount}</Text>
                </View>
              )}
            </View>
            {item.clubName && <Text style={s.listCardSub}>{item.clubName}</Text>}
            <View style={s.listCardMeta}>
              <Text style={s.listCardMetaText}>{item.courts || '?'} banor · {item.surface || 'Sand'}</Text>
              <Text style={s.listCardMetaText}>{item.isIndoor ? '🏠 Inomhus' : '☀️ Utomhus'}</Text>
            </View>
          </TouchableOpacity>
        );
    }

    return (
        <TouchableOpacity key={item.id || index} style={s.listCard} activeOpacity={0.7}
          onPress={() => {
            if (activeFilter === 'groups') router.push(`/group/${item.id}`);
            else Linking.openURL(`https://beachvibes.app/${activeFilter === 'clubs' ? 'clubs' : 'courts'}/${item.id}`);
          }}>
            <Text style={s.listCardTitle}>{item.name}</Text>
        </TouchableOpacity>
    );
  };

  // ─── Fan (solfjäder) layout ─────────────────────────────────────────────
  // When multiple items share the same anchor (courtId or lat/lng), distribute
  // them in a 180° fan above the anchor — leftmost = earliest date, rightmost
  // = latest date. Uses small lat/lng offsets to position the fan satellites.

  const FAN_MAX_VISIBLE = 8;

  /** Return lat/lng offset for position `index` out of `total` in a 180° fan. */
  function getFanOffset(index: number, total: number): { dLat: number; dLng: number } {
    if (total <= 1) return { dLat: 0.0006, dLng: 0 }; // single satellite → straight up
    const slots = Math.max(total, 1);
    // angle from π (left) to 2π (right) through top center
    const angleRad = Math.PI + (Math.PI * (index + 1)) / (slots + 1);
    const radiusLat = 0.0006; // ~66m — visual spread in latitude
    const radiusLng = 0.0008; // slightly wider in longitude for readability
    return {
      dLat: radiusLat * Math.sin(angleRad) * -1, // invert: fan goes UP (positive lat)
      dLng: radiusLng * Math.cos(angleRad),
    };
  }

  interface FanSatellite {
    item: any;
    kind: 'event' | 'tournament' | 'group';
    sortKey: string;
  }

  /** Build fan buckets: group satellites by their anchor court's lat/lng. */
  const fanBuckets = useMemo(() => {
    const buckets = new Map<string, { anchor: { latitude: number; longitude: number; courtItem?: any }; satellites: FanSatellite[] }>();

    const courtMap = new Map<string, any>();
    for (const c of mapData.courts || []) {
      if (c.latitude && c.longitude) courtMap.set(c.id, c);
    }

    const getAnchorKey = (lat: number, lng: number) => `${lat.toFixed(4)},${lng.toFixed(4)}`;

    const addSat = (anchorLat: number, anchorLng: number, sat: FanSatellite, courtItem?: any) => {
      const key = getAnchorKey(anchorLat, anchorLng);
      if (!buckets.has(key)) {
        buckets.set(key, { anchor: { latitude: anchorLat, longitude: anchorLng, courtItem }, satellites: [] });
      }
      buckets.get(key)!.satellites.push(sat);
    };

    // Events → anchor to their court
    for (const e of mapData.events || []) {
      if (e.courtId && courtMap.has(e.courtId)) {
        const court = courtMap.get(e.courtId)!;
        addSat(court.latitude, court.longitude, { item: e, kind: 'event', sortKey: e.date || '' }, court);
      } else if (e.latitude && e.longitude) {
        addSat(e.latitude, e.longitude, { item: e, kind: 'event', sortKey: e.date || '' });
      }
    }

    // Tournaments → anchor to court or club location
    for (const t of mapData.tournaments || []) {
      if (t.anchorCourtId && courtMap.has(t.anchorCourtId)) {
        const court = courtMap.get(t.anchorCourtId)!;
        addSat(court.latitude, court.longitude, { item: t, kind: 'tournament', sortKey: t.startDate || '' }, court);
      } else if (t.latitude && t.longitude) {
        addSat(t.latitude, t.longitude, { item: t, kind: 'tournament', sortKey: t.startDate || '' });
      }
    }

    // Groups → anchor to home court
    for (const g of mapData.groups || []) {
      if (g.homeCourtId && courtMap.has(g.homeCourtId)) {
        const court = courtMap.get(g.homeCourtId)!;
        addSat(court.latitude, court.longitude, { item: g, kind: 'group', sortKey: g.name || g.id }, court);
      } else if (g.latitude && g.longitude) {
        addSat(g.latitude, g.longitude, { item: g, kind: 'group', sortKey: g.name || g.id });
      }
    }

    // Sort each bucket: earliest date = leftmost in fan
    for (const bucket of buckets.values()) {
      bucket.satellites.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
    }

    return buckets;
  }, [mapData]);

  const renderMarkers = () => {
    const markers: React.ReactElement[] = [];

    // Determine what we're showing
    const showCourts = activeFilter === 'courts';
    const showEvents = activeFilter === 'events';
    const showTraining = activeFilter === 'training';
    const showTournaments = activeFilter === 'tournaments';
    const showClubs = activeFilter === 'clubs';
    const showGroups = activeFilter === 'groups';

    // ── Courts: render court markers with fan satellites ──
    if (showCourts) {
      const rendered = new Set<string>(); // court lat/lng keys already rendered
      for (const c of mapData.courts || []) {
        if (!c.latitude || !c.longitude) continue;
        const key = `${c.latitude.toFixed(4)},${c.longitude.toFixed(4)}`;
        if (rendered.has(key)) continue;
        rendered.add(key);

        // Court anchor marker — web uses 44px, orange for club courts, cyan for others
        const imgUrl = c.imageUrl || c.images?.[0]?.url;
        const isClubCourt = !!c.clubName;
        const bucket = fanBuckets.get(key);
        const bucketCount = bucket?.satellites.length || 0;
        markers.push(
          <ImageMarker
            key={`court-${c.id}`}
            coordinate={{ latitude: c.latitude, longitude: c.longitude }}
            onPress={() => handleMarkerPress(c, 'court')}
            imgUrl={imgUrl}
            iconBg={isClubCourt ? '#f97316' : '#06b6d4'}
            emoji="🏐"
            isFocused={pinFocus?.id === c.id}
            isCluster={false}
            clusterCount={0}
            size={44}
            dateBadge={bucketCount > 0 ? `${bucketCount} event` : undefined}
          />
        );

        // Fan satellites for this court's location
        if (bucket && bucket.satellites.length > 0) {
          const visible = bucket.satellites.slice(0, FAN_MAX_VISIBLE);
          const overflow = bucket.satellites.length - FAN_MAX_VISIBLE;

          visible.forEach((sat, idx) => {
            const { dLat, dLng } = getFanOffset(idx, visible.length);
            // Match web's typeConfig colors exactly
            let satIconBg = '#22c55e'; // spel = green
            let satEmoji = '🏐';
            let satType = 'event';
            if (sat.kind === 'tournament') { satIconBg = '#fbbf24'; satEmoji = '🏆'; satType = 'tournament'; }
            else if (sat.kind === 'group') { satIconBg = sat.item.color || '#a855f7'; satEmoji = sat.item.emoji || '👥'; satType = 'group'; }
            else if (sat.item.type === 'Träning') { satIconBg = '#06b6d4'; satEmoji = '🎯'; }

            const satImgUrl = sat.item.imageUrl || sat.item.images?.[0]?.url || sat.item.logoUrl;
            markers.push(
              <ImageMarker
                key={`fan-${c.id}-${sat.kind}-${sat.item.id}`}
                coordinate={{
                  latitude: c.latitude + dLat,
                  longitude: c.longitude + dLng,
                }}
                onPress={() => handleMarkerPress(sat.item, satType)}
                imgUrl={satImgUrl}
                iconBg={satIconBg}
                emoji={satEmoji}
                isFocused={false}
                isCluster={idx === visible.length - 1 && overflow > 0}
                clusterCount={overflow}
                size={32}
                dateBadge={sat.item.date ? shortDate(sat.item.date) : sat.item.startDate ? shortDate(sat.item.startDate) : undefined}
              />
            );
          });
        }
      }
    }

    // ── Events / Training / Tournaments / Groups: fan by shared location ──
    if (showEvents || showTraining || showTournaments || showGroups) {
      let items: any[] = [];
      let iconBg = '#22c55e';
      let emoji = '🏐';
      let type = 'event';

      if (showEvents) { items = (mapData.events || []).filter(e => e.type !== 'Träning'); iconBg = '#22c55e'; emoji = '🏐'; type = 'event'; }
      else if (showTraining) { items = (mapData.events || []).filter(e => e.type === 'Träning'); iconBg = '#06b6d4'; emoji = '🎯'; type = 'event'; }
      else if (showTournaments) { items = mapData.tournaments || []; iconBg = '#fbbf24'; emoji = '🏆'; type = 'tournament'; }
      else if (showGroups) { items = mapData.groups || []; iconBg = '#a855f7'; emoji = '👥'; type = 'group'; }

      // Group by location
      const groups: Record<string, any[]> = {};
      items.forEach(item => {
        // Find anchor location
        let lat = item.latitude;
        let lng = item.longitude;
        if (item.courtId) {
          const court = (mapData.courts || []).find((c: any) => c.id === item.courtId);
          if (court) { lat = court.latitude; lng = court.longitude; }
        }
        if (!lat || !lng) return;
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push({ ...item, _anchorLat: lat, _anchorLng: lng });
      });

      for (const [key, group] of Object.entries(groups)) {
        // Sort by date (earliest first = leftmost)
        group.sort((a: any, b: any) => {
          const dateA = a.date || a.startDate || a.name || '';
          const dateB = b.date || b.startDate || b.name || '';
          return dateA.localeCompare(dateB);
        });

        if (group.length === 1) {
          // Single marker — no fan needed
          const item = group[0];
          const imgUrl = item.imageUrl || item.images?.[0]?.url || item.logoUrl;
          markers.push(
            <ImageMarker
              key={`single-${type}-${item.id}`}
              coordinate={{ latitude: item._anchorLat, longitude: item._anchorLng }}
              onPress={() => handleMarkerPress(item, type)}
              imgUrl={imgUrl}
              iconBg={iconBg}
              emoji={emoji}
              isFocused={pinFocus?.id === item.id}
              isCluster={false}
              clusterCount={0}
              size={32}
              dateBadge={item.date ? shortDate(item.date) : item.startDate ? shortDate(item.startDate) : undefined}
            />
          );
        } else {
          // Multiple → fan them out
          const visible = group.slice(0, FAN_MAX_VISIBLE);
          const overflow = group.length - FAN_MAX_VISIBLE;
          const anchorLat = group[0]._anchorLat;
          const anchorLng = group[0]._anchorLng;

          visible.forEach((item: any, idx: number) => {
            const { dLat, dLng } = getFanOffset(idx, visible.length);
            const imgUrl = item.imageUrl || item.images?.[0]?.url || item.logoUrl;
            markers.push(
              <ImageMarker
                key={`fan-${type}-${item.id}`}
                coordinate={{
                  latitude: anchorLat + dLat,
                  longitude: anchorLng + dLng,
                }}
                onPress={() => handleMarkerPress(item, type)}
                imgUrl={imgUrl}
                iconBg={iconBg}
                emoji={emoji}
                isFocused={pinFocus?.id === item.id}
                isCluster={idx === visible.length - 1 && overflow > 0}
                clusterCount={overflow}
                size={32}
                dateBadge={item.date ? shortDate(item.date) : item.startDate ? shortDate(item.startDate) : undefined}
              />
            );
          });
        }
      }
    }

    // ── Clubs: simple markers (no fan) — web uses size 42, purple border ──
    if (showClubs) {
      for (const club of mapData.clubs || []) {
        if (!club.latitude || !club.longitude) continue;
        const imgUrl = club.imageUrl || club.logoUrl;
        markers.push(
          <ImageMarker
            key={`club-${club.id}`}
            coordinate={{ latitude: club.latitude, longitude: club.longitude }}
            onPress={() => handleMarkerPress(club, 'club')}
            imgUrl={imgUrl}
            iconBg="#8b5cf6"
            emoji="🏢"
            isFocused={pinFocus?.id === club.id}
            isCluster={false}
            clusterCount={0}
            size={42}
            dateBadge={club.memberCount ? `${club.memberCount} mbr` : undefined}
          />
        );
      }
    }

    return markers;
  };

  const items = getActiveItems();
  const activeEmoji = FILTERS.find(f => f.key === activeFilter)?.emoji || '';

  const handleMapPress = () => {
    if (Date.now() - lastMarkerPressRef.current < 300) return;

    if (showMapStylePicker) setShowMapStylePicker(false);
    if (panelExpanded) {
      Animated.spring(panelHeight, { toValue: PANEL_COLLAPSED, useNativeDriver: false, friction: 8 }).start();
      setPanelExpanded(false);
    }
    clearPinFocus();
  };

  return (
    <View style={s.container}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={handleMapPress}
        onRegionChangeComplete={handleRegionChange}
        mapType={mapStyle === 'satellite' ? 'hybrid' : 'standard'}
        provider={PROVIDER_GOOGLE}
        customMapStyle={mapStyle === 'dark' ? DARK_MAP_STYLE : []}
      >
        {renderMarkers()}
      </MapView>

      {/* Floating Top Overlay matching web .topOverlay */}
      <LinearGradient 
         colors={['rgba(10,10,20,0.85)', 'rgba(10,10,20,0.4)', 'transparent']} 
         style={[s.topOverlay, { paddingTop: insets.top + 10 }]}
         pointerEvents="box-none"
      >
        {/* Search Bar */}
        <View style={s.topRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => Linking.openURL('https://beachvibes.app/')}>
             <Ionicons name="arrow-back" size={20} color={Colors.textPrimary} />
          </TouchableOpacity>
          <View style={s.searchBar}>
             <Ionicons name="search" size={18} color={Colors.textTertiary} style={{marginRight: 6}} />
             <TextInput
                style={s.searchInput}
                placeholder="Sök banor, klubbar, events..."
                placeholderTextColor={Colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
             />
             {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                   <Ionicons name="close-circle" size={18} color={Colors.textTertiary} />
                </TouchableOpacity>
             )}
          </View>
        </View>

        {/* Tab Pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginTop: 12 }} contentContainerStyle={s.tabRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.tabPill, activeFilter === f.key && s.tabPillActive]}
              onPress={() => handleFilterChange(f.key)}
            >
               <Text style={s.tabPillEmoji}>{f.emoji}</Text>
               <Text style={[s.tabPillText, activeFilter === f.key && s.tabPillTextActive]}>{f.label}</Text>
               {counts[f.key] > 0 && (
                  <Text style={[s.tabPillCount, activeFilter === f.key && s.tabPillCountActive]}>{counts[f.key]}</Text>
               )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      </LinearGradient>

      {loading && (
        <View style={s.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.brandPrimary} />
        </View>
      )}
      {!loading && error && (
        <View style={s.loadingOverlay}>
           <Ionicons name="warning-outline" size={48} color={Colors.brandPrimary} />
           <Text style={{ color: Colors.textSecondary, marginTop: 12 }}>{error}</Text>
        </View>
      )}

      {/* ── Map Style Toggle ─────────────────────────────────────── */}
      <View style={{
        position: 'absolute', right: 12, bottom: PANEL_COLLAPSED + 16,
        zIndex: 10, alignItems: 'flex-end',
      }}>
        {showMapStylePicker && (
          <View style={{
            backgroundColor: 'rgba(15, 15, 30, 0.92)',
            borderRadius: 14, marginBottom: 8,
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
            overflow: 'hidden',
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 12 },
              android: { elevation: 8 },
            }),
          }}>
            {MAP_STYLES.map((ms, idx) => (
              <TouchableOpacity
                key={ms.key}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  paddingHorizontal: 16, paddingVertical: 12,
                  backgroundColor: mapStyle === ms.key ? 'rgba(6, 182, 212, 0.15)' : 'transparent',
                  borderBottomWidth: idx < MAP_STYLES.length - 1 ? 1 : 0,
                  borderBottomColor: 'rgba(255,255,255,0.06)',
                }}
                onPress={() => { setMapStyle(ms.key); setShowMapStylePicker(false); }}
              >
                <Ionicons
                  name={ms.icon as any}
                  size={18}
                  color={mapStyle === ms.key ? '#06b6d4' : 'rgba(255,255,255,0.6)'}
                  style={{ marginRight: 10 }}
                />
                <Text style={{
                  color: mapStyle === ms.key ? '#06b6d4' : 'rgba(255,255,255,0.8)',
                  fontSize: 14, fontWeight: mapStyle === ms.key ? '700' : '500',
                }}>{ms.label}</Text>
                {mapStyle === ms.key && (
                  <Ionicons name="checkmark" size={16} color="#06b6d4" style={{ marginLeft: 'auto' }} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        )}
        <TouchableOpacity
          onPress={() => setShowMapStylePicker(prev => !prev)}
          style={{
            width: 44, height: 44, borderRadius: 22,
            backgroundColor: 'rgba(15, 15, 30, 0.85)',
            alignItems: 'center', justifyContent: 'center',
            borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
            ...Platform.select({
              ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 6 },
              android: { elevation: 6 },
            }),
          }}
        >
          <Ionicons
            name={mapStyle === 'dark' ? 'moon' : mapStyle === 'light' ? 'sunny' : 'earth'}
            size={20}
            color="#06b6d4"
          />
        </TouchableOpacity>
      </View>

      {!loading && (
          <Animated.View style={[s.bottomSheet, { height: panelHeight }]}>  
            <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
            <Animated.View {...panResponder.panHandlers} style={s.sheetHandle}>
              <View style={s.sheetHandleBar} />
              <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', paddingHorizontal: 16}}>
                  {pinFocus ? (
                     <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                        <Text style={s.bottomSheetTitle} numberOfLines={1}>📍 {pinFocus.name}</Text>
                        <TouchableOpacity onPress={clearPinFocus} style={s.clearFocusBtn}>
                            <Ionicons name="close-circle" size={24} color={Colors.textTertiary} />
                        </TouchableOpacity>
                     </View>
                  ) : (
                     <Text style={s.sheetHandleLabel}>{activeEmoji} {items.length} träffar</Text>
                  )}
              </View>
            </Animated.View>

            <ScrollView style={s.sheetContent} showsVerticalScrollIndicator={false}>
               {pinFocus ? (
                  <>
                    <TouchableOpacity style={s.listCard} activeOpacity={0.7}
                      onPress={() => Linking.openURL(`https://beachvibes.app/${pinFocus.kind === 'court' ? 'courts' : 'clubs'}/${pinFocus.id}`)}>
                      <View style={s.listCardHeader}>
                        <View style={[s.dot, { backgroundColor: Colors.brandPrimary }]} />
                        <Text style={s.listCardTitle} numberOfLines={1}>{pinFocus.name}</Text>
                      </View>
                      {pinFocus.address && <Text style={s.listCardSub}>📍 {pinFocus.address}</Text>}
                      <View style={s.listCardMeta}>
                        <Text style={[s.listCardMetaText, { color: Colors.brandAccent, fontWeight: '600' }]}>
                          Visa {pinFocus.kind === 'court' ? 'bana' : 'klubb'} →
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {focusedEvents.length === 0 && focusedTournaments.length === 0 && focusedGroups.length === 0 && (
                      <View style={s.emptyState}>
                        <Text style={{ fontSize: 14, color: Colors.textTertiary, textAlign: 'center' }}>
                            Inga kommande events, turneringar eller grupper här.
                        </Text>
                      </View>
                    )}

                    {focusedEvents.length > 0 && (
                      <Text style={s.groupHeader}>Kommande events ({focusedEvents.length})</Text>
                    )}
                    {focusedEvents.map((e, i) => renderListItem(e, i))}

                    {focusedTournaments.length > 0 && (
                      <Text style={s.groupHeader}>Turneringar ({focusedTournaments.length})</Text>
                    )}
                    {focusedTournaments.map((t, i) => renderListItem(t, i))}

                    {focusedGroups.length > 0 && (
                      <Text style={s.groupHeader}>Grupper ({focusedGroups.length})</Text>
                    )}
                    {focusedGroups.map((g, i) => (
                      <TouchableOpacity key={g.id || i} style={s.listCard} activeOpacity={0.7}
                        onPress={() => router.push(`/group/${g.id}`)}>
                        <View style={s.listCardHeader}>
                          {g.imageUrl ? (
                            <Image source={{ uri: g.imageUrl }} style={s.listCardThumb} />
                          ) : (
                            <Text style={{ fontSize: 16 }}>{g.emoji || '👥'}</Text>
                          )}
                          <Text style={s.listCardTitle} numberOfLines={1}>{g.name}</Text>
                        </View>
                        <Text style={s.listCardSub}>🏐 {g.homeCourtName}</Text>
                        <View style={s.listCardMeta}>
                          <Text style={s.listCardMetaText}>👤 {g.memberCount} medlemmar</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </>
               ) : items.length === 0 ? (
                  <View style={s.emptyState}>
                    <Text style={{ fontSize: 32, marginBottom: 8 }}>{activeEmoji}</Text>
                    <Text style={{ fontSize: 14, color: Colors.textTertiary, textAlign: 'center' }}>Inga resultat</Text>
                  </View>
                ) : (
                  items.slice(0, 50).map((item, i) => renderListItem(item, i))
                )}
                <View style={{ height: 40 }} />
            </ScrollView>
          </Animated.View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bgPrimary },
  topOverlay: {
     position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
     paddingHorizontal: 16, paddingBottom: 20,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  backBtn: {
     width: 40, height: 40, borderRadius: 20,
     backgroundColor: 'rgba(20,20,35,0.85)',
     borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
     alignItems: 'center', justifyContent: 'center',
  },
  searchBar: {
     flex: 1, flexDirection: 'row', alignItems: 'center',
     backgroundColor: 'rgba(20,20,35,0.85)',
     borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
     borderRadius: 20, height: 44, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.textPrimary },
  tabRow: { gap: 8, paddingRight: 20 },
  tabPill: { 
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 16, paddingVertical: 8,
      borderRadius: 100, backgroundColor: 'rgba(20,20,35,0.8)', 
      borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)',
  },
  tabPillActive: { 
      backgroundColor: 'rgba(34,211,238,0.15)', 
      borderColor: 'rgba(34,211,238,0.5)',
  },
  tabPillEmoji: { fontSize: 13 },
  tabPillText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  tabPillTextActive: { color: '#67e8f9' }, // brand-accent-light
  tabPillCount: { fontSize: 11, color: 'rgba(255,255,255,0.5)' },
  tabPillCountActive: { color: '#67e8f9', opacity: 0.8 },
  loadingOverlay: { 
      ...StyleSheet.absoluteFillObject, 
      justifyContent: 'center', alignItems: 'center', 
      backgroundColor: 'rgba(10,10,10,0.6)', zIndex: 5 
  },
  // (marker styles are now inline in the ImageMarker component)
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(15,15,30,0.85)',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  sheetHandle: { paddingTop: 12, paddingBottom: 12, alignItems: 'center' },
  sheetHandleBar: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)',
    marginBottom: 12,
  },
  sheetHandleLabel: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, letterSpacing: 0.5 },
  bottomSheetTitle: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  clearFocusBtn: { padding: 4, marginRight: -4 },
  sheetContent: { flex: 1, paddingHorizontal: 16 },
  listCard: {
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 8,
    gap: 4,
  },
  listCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  listCardTitle: { fontSize: 15, fontWeight: '700', color: Colors.textPrimary, flex: 1 },
  listCardSub: { fontSize: 13, color: Colors.textSecondary, marginLeft: 18 },
  listCardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginLeft: 18 },
  listCardMetaText: { fontSize: 12, color: Colors.textTertiary },
  dot: { width: 10, height: 10, borderRadius: 5 },
  listCardThumb: { 
    width: 28, height: 28, borderRadius: 14, 
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.15)',
  },
  emptyState: { alignItems: 'center', paddingVertical: 40 },
  eventBadge: {
    backgroundColor: Colors.brandAccent, borderRadius: 10, minWidth: 20,
    paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center',
  },
  eventBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  levelBadge: {
    backgroundColor: Colors.brandPrimary, borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  levelBadgeText: { fontSize: 10, fontWeight: '800', color: '#fff' },
  groupHeader: { 
    fontSize: 11, fontWeight: '700', color: Colors.textTertiary, 
    textTransform: 'uppercase', letterSpacing: 0.5, 
    paddingHorizontal: 4, paddingTop: 12, paddingBottom: 6 
  },
});
