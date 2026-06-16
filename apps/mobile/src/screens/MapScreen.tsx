import React, { useState } from 'react';
import {
  View, Text, StyleSheet, SafeAreaView, TouchableOpacity,
  ScrollView, ActivityIndicator,
} from 'react-native';
import MapView, { Marker, Callout } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface Marina {
  id: string; name: string; lake: string; city: string; state: string;
  latitude?: number; longitude?: number; logoUrl?: string;
}

// Fallback coordinates for known launch lakes if GPS not stored yet
const LAKE_COORDS: Record<string, { lat: number; lng: number }> = {
  'Table Rock Lake': { lat: 36.5746, lng: -93.3155 },
  'Lake Murray':     { lat: 34.8723, lng: -97.0856 },
};

export default function MapScreen() {
  const router  = useRouter();
  const [selected, setSelected] = useState<Marina | null>(null);

  const { data: marinas = [], isLoading } = useQuery<Marina[]>({
    queryKey: ['marinas'],
    queryFn:  () => api.get('/marinas').then(r => r.data),
  });

  const marinasWithCoords = marinas.map(m => {
    if (m.latitude && m.longitude) return m;
    const fallback = LAKE_COORDS[m.lake];
    return fallback ? { ...m, latitude: fallback.lat, longitude: fallback.lng } : null;
  }).filter(Boolean) as (Marina & { latitude: number; longitude: number })[];

  const initialRegion = {
    latitude:       36.5,
    longitude:      -93.5,
    latitudeDelta:  5,
    longitudeDelta: 8,
  };

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <Text style={st.title}>Marina Map</Text>
        <Text style={st.subtitle}>{marinas.length} partner marina{marinas.length !== 1 ? 's' : ''}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ flex: 1 }} color="#1d6fdb" />
      ) : (
        <MapView style={st.map} initialRegion={initialRegion}>
          {marinasWithCoords.map(m => (
            <Marker
              key={m.id}
              coordinate={{ latitude: m.latitude, longitude: m.longitude }}
              title={m.name}
              description={`${m.lake} · ${m.city}, ${m.state}`}
              onPress={() => setSelected(m)}
              pinColor="#1d6fdb"
            >
              <Callout tooltip>
                <View style={st.callout}>
                  <Text style={st.calloutName}>{m.name}</Text>
                  <Text style={st.calloutMeta}>{m.lake}</Text>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      )}

      {/* Selected marina card */}
      {selected && (
        <View style={st.card}>
          <View style={st.cardInner}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardName}>{selected.name}</Text>
              <Text style={st.cardMeta}>{selected.lake} · {selected.city}, {selected.state}</Text>
            </View>
            <TouchableOpacity
              style={st.viewBtn}
              onPress={() => router.push({ pathname: '/(tabs)/search', params: {} })}
              activeOpacity={0.85}
            >
              <Text style={st.viewBtnText}>View Boats</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={st.closeBtn} onPress={() => setSelected(null)}>
            <Text style={st.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Marina list fallback (shown when no selection) */}
      {!selected && !isLoading && (
        <ScrollView style={st.list} contentContainerStyle={{ padding: 12, gap: 8 }}>
          <Text style={st.listTitle}>Partner Marinas</Text>
          {marinas.map(m => (
            <TouchableOpacity key={m.id} style={st.listItem} onPress={() => setSelected(m)}>
              <Text style={st.listItemName}>{m.name}</Text>
              <Text style={st.listItemMeta}>{m.lake} · {m.city}, {m.state}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafc' },
  header:        { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title:         { fontSize: 20, fontWeight: '700', color: '#111827' },
  subtitle:      { fontSize: 13, color: '#6b7280', marginTop: 2 },
  map:           { flex: 1 },
  callout:       { backgroundColor: '#fff', borderRadius: 10, padding: 10, minWidth: 140, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 6, elevation: 4 },
  calloutName:   { fontSize: 13, fontWeight: '700', color: '#111827' },
  calloutMeta:   { fontSize: 11, color: '#6b7280', marginTop: 2 },
  card:          { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 12, elevation: 8 },
  cardInner:     { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardName:      { fontSize: 16, fontWeight: '700', color: '#111827' },
  cardMeta:      { fontSize: 12, color: '#6b7280', marginTop: 2 },
  viewBtn:       { backgroundColor: '#1d6fdb', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16 },
  viewBtnText:   { color: '#fff', fontWeight: '700', fontSize: 13 },
  closeBtn:      { position: 'absolute', top: 12, right: 16 },
  closeBtnText:  { fontSize: 16, color: '#9ca3af' },
  list:          { maxHeight: 200, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  listTitle:     { fontSize: 12, fontWeight: '600', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 8 },
  listItem:      { backgroundColor: '#f9fafb', borderRadius: 12, padding: 12 },
  listItemName:  { fontSize: 14, fontWeight: '600', color: '#111827' },
  listItemMeta:  { fontSize: 12, color: '#6b7280', marginTop: 2 },
});
