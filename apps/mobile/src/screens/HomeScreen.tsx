import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, SafeAreaView,
} from 'react-native';
import { useRouter } from 'expo-router';

const LAKES = ['Table Rock Lake', 'Lake Murray', 'Lake of the Ozarks', 'Lake Taneycomo'];
const TYPES = ['Any', 'Pontoon', 'Ski Boat', 'Fishing', 'Jet Ski'];

export default function HomeScreen() {
  const router = useRouter();
  const [selectedLake, setSelectedLake] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState('Any');
  const [date,         setDate]         = useState('');

  const handleSearch = () => {
    const qs = new URLSearchParams();
    if (selectedType !== 'Any') qs.set('type', selectedType);
    if (date) qs.set('date', date);
    router.push({ pathname: '/(tabs)/search', params: Object.fromEntries(qs) });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>Find Your Perfect Boat</Text>
          <Text style={styles.heroSubtitle}>Real-time availability from top marinas</Text>
        </View>

        <View style={styles.searchCard}>
          <Text style={styles.sectionLabel}>Where are you going?</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {LAKES.map(lake => (
              <TouchableOpacity key={lake}
                style={[styles.chip, selectedLake === lake && styles.chipActive]}
                onPress={() => setSelectedLake(lake === selectedLake ? null : lake)}>
                <Text style={[styles.chipText, selectedLake === lake && styles.chipTextActive]}>
                  {lake}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.sectionLabel}>Date</Text>
          <TextInput
            style={styles.input}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#9ca3af"
            value={date}
            onChangeText={setDate}
          />

          <Text style={styles.sectionLabel}>Boat Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
            {TYPES.map(type => (
              <TouchableOpacity key={type}
                style={[styles.chip, selectedType === type && styles.chipActive]}
                onPress={() => setSelectedType(type)}>
                <Text style={[styles.chipText, selectedType === type && styles.chipTextActive]}>
                  {type}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} activeOpacity={0.85}>
            <Text style={styles.searchBtnText}>Search Boats</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8fafc' },
  hero:            { padding: 24, paddingTop: 32, backgroundColor: '#1d6fdb' },
  heroTitle:       { fontSize: 28, fontWeight: '800', color: '#fff' },
  heroSubtitle:    { fontSize: 15, color: '#bfdbfe', marginTop: 4 },
  searchCard:      { margin: 16, backgroundColor: '#fff', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, elevation: 3 },
  sectionLabel:    { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  chipRow:         { marginBottom: 4 },
  chip:            { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, backgroundColor: '#fff' },
  chipActive:      { backgroundColor: '#1d6fdb', borderColor: '#1d6fdb' },
  chipText:        { fontSize: 13, color: '#374151' },
  chipTextActive:  { color: '#fff', fontWeight: '600' },
  input:           { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', backgroundColor: '#f9fafb' },
  searchBtn:       { backgroundColor: '#1d6fdb', borderRadius: 14, paddingVertical: 16, marginTop: 20, alignItems: 'center' },
  searchBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
});
