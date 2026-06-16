import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  SafeAreaView, TextInput, ScrollView,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface BoatListing {
  id: string; name: string; type: string; capacity: number; dailyRate: number;
  marina: { name: string; lake: string }; rating: number | null; reviewCount: number;
}

const BOAT_TYPES = ['Any', 'Pontoon', 'Ski Boat', 'Fishing', 'Jet Ski'];
const LAKES      = ['Any Lake', 'Table Rock Lake', 'Lake Murray', 'Lake of the Ozarks'];

// lake name → marinaId filter isn't needed — we filter client-side on marina.lake
function matchesLake(boat: BoatListing, lake: string) {
  if (lake === 'Any Lake') return true;
  return boat.marina?.lake?.toLowerCase().includes(lake.toLowerCase());
}

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string; date?: string }>();

  const [date,         setDate]         = useState(params.date ?? '');
  const [guests,       setGuests]       = useState('');
  const [selectedType, setSelectedType] = useState(params.type ?? 'Any');
  const [selectedLake, setSelectedLake] = useState('Any Lake');

  // Re-read params if the home screen pushes new ones
  useEffect(() => { if (params.type) setSelectedType(params.type); }, [params.type]);
  useEffect(() => { if (params.date) setDate(params.date); }, [params.date]);

  const { data: allBoats = [], isLoading } = useQuery<BoatListing[]>({
    queryKey: ['boats', 'search', selectedType, date, guests],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (selectedType !== 'Any') qs.set('type', selectedType);
      if (date)   qs.set('date',   date);
      if (guests) qs.set('guests', guests);
      return api.get(`/boats?${qs}`).then(r => r.data);
    },
    refetchInterval: 30_000,
  });

  // Lake filter is client-side (we don't have a lake query param on the API yet)
  const boats = allBoats.filter(b => matchesLake(b, selectedLake));

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Available Boats</Text>

        {/* Lake filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
          {LAKES.map(lake => (
            <TouchableOpacity key={lake}
              style={[styles.chip, selectedLake === lake && styles.chipActive]}
              onPress={() => setSelectedLake(lake)}>
              <Text style={[styles.chipText, selectedLake === lake && styles.chipTextActive]}>{lake}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Date + guests */}
        <View style={styles.filterRow}>
          <TextInput style={[styles.input, { flex: 1 }]}
            placeholder="Date (YYYY-MM-DD)" placeholderTextColor="#9ca3af"
            value={date} onChangeText={setDate} returnKeyType="search" />
          <TextInput style={[styles.input, { width: 75 }]}
            placeholder="Guests" placeholderTextColor="#9ca3af"
            keyboardType="number-pad" value={guests} onChangeText={setGuests} />
        </View>

        {/* Boat type */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {BOAT_TYPES.map(type => (
            <TouchableOpacity key={type}
              style={[styles.chip, selectedType === type && styles.chipActive]}
              onPress={() => setSelectedType(type)}>
              <Text style={[styles.chipText, selectedType === type && styles.chipTextActive]}>{type}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={boats}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>{isLoading ? 'Searching…' : 'No boats found.'}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} onPress={() => router.push(`/boat/${item.id}`)} activeOpacity={0.85}>
            <View style={styles.cardImg}>
              <View style={styles.typeBadge}><Text style={styles.typeBadgeText}>{item.type}</Text></View>
            </View>
            <View style={styles.cardBody}>
              <View style={styles.cardTitleRow}>
                <Text style={styles.cardName}>{item.name}</Text>
                {item.rating != null && <Text style={styles.cardRating}>★ {item.rating} ({item.reviewCount})</Text>}
              </View>
              <Text style={styles.cardMeta}>{item.marina?.lake} · {item.marina?.name} · {item.capacity} guests</Text>
              <View style={styles.cardFooter}>
                <Text style={styles.cardPrice}>${item.dailyRate}<Text style={styles.cardPriceSuffix}>/day</Text></Text>
                <View style={styles.bookBadge}><Text style={styles.bookBadgeText}>Book →</Text></View>
              </View>
            </View>
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  header:         { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', gap: 8 },
  title:          { fontSize: 20, fontWeight: '700', color: '#111827' },
  filterRow:      { flexDirection: 'row', gap: 8 },
  input:          { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb' },
  chipRow:        { marginBottom: 2 },
  chip:           { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 100, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8, backgroundColor: '#fff' },
  chipActive:     { backgroundColor: '#1d6fdb', borderColor: '#1d6fdb' },
  chipText:       { fontSize: 13, color: '#374151', fontWeight: '500' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list:           { padding: 16, gap: 14 },
  card:           { backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2 },
  cardImg:        { height: 160, backgroundColor: '#dbeafe', justifyContent: 'flex-end', alignItems: 'flex-start', padding: 10 },
  typeBadge:      { backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4 },
  typeBadgeText:  { fontSize: 11, fontWeight: '600', color: '#1d6fdb' },
  cardBody:       { padding: 14 },
  cardTitleRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardName:       { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  cardRating:     { fontSize: 12, color: '#6b7280' },
  cardMeta:       { fontSize: 12, color: '#6b7280', marginTop: 3, marginBottom: 10 },
  cardFooter:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardPrice:      { fontSize: 18, fontWeight: '800', color: '#111827' },
  cardPriceSuffix:{ fontSize: 12, fontWeight: '400', color: '#6b7280' },
  bookBadge:      { backgroundColor: '#1d6fdb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  bookBadgeText:  { color: '#fff', fontSize: 13, fontWeight: '700' },
  empty:          { padding: 40, alignItems: 'center' },
  emptyText:      { color: '#9ca3af', fontSize: 15 },
});
