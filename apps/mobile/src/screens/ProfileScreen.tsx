import React, { useCallback, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, FlatList, ActivityIndicator, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { useAuthedApi } from '@/lib/useAuthedApi';
import api from '@/lib/api';

interface Reservation {
  id: string; startDate: string; endDate: string; status: string; totalAmount?: number;
  boat: { name: string; type: string; marina: { name: string } };
}
interface BoatListing {
  id: string; name: string; type: string; dailyRate: number; marina: { name: string; lake: string };
}

const STATUS_CFG: Record<string,{ text: string; color: string }> = {
  pending:     { text: 'Pending',    color: '#f59e0b' },
  confirmed:   { text: 'Confirmed',  color: '#3b82f6' },
  checked_in:  { text: 'Checked In', color: '#10b981' },
  checked_out: { text: 'Complete',   color: '#6b7280' },
  cancelled:   { text: 'Cancelled',  color: '#ef4444' },
  no_show:     { text: 'No Show',    color: '#9ca3af' },
};

type Tab = 'menu' | 'bookings' | 'saved';

export default function ProfileScreen() {
  const { signOut }     = useAuth();
  const { user }        = useUser();
  const router          = useRouter();
  const authedApi       = useAuthedApi();
  const queryClient     = useQueryClient();
  const [tab, setTab]   = useState<Tab>('menu');

  const initials = (user?.fullName ?? user?.primaryEmailAddress?.emailAddress ?? '?')
    .split(' ').map(p => p[0]).join('').slice(0,2).toUpperCase();

  const { data: reservations = [], isLoading: resLoading } = useQuery<Reservation[]>({
    queryKey: ['my-reservations'],
    queryFn:  () => authedApi.get('/reservations').then(r => r.data),
    enabled:  tab === 'bookings',
  });

  const { data: favorites = [], isLoading: favLoading } = useQuery<BoatListing[]>({
    queryKey: ['favorites'],
    queryFn:  () => authedApi.get('/favorites').then(r => r.data),
    enabled:  tab === 'saved',
  });

  const removeFav = useMutation({
    mutationFn: (boatId: string) => authedApi.post(`/favorites/${boatId}`, {}),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['favorites'] }),
  });

  const handleSignOut = useCallback(async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  }, [signOut, router]);

  const MENU = [
    { label: 'My Bookings',         icon: '📅', onPress: () => setTab('bookings') },
    { label: 'Saved Boats',         icon: '❤️',  onPress: () => setTab('saved')   },
    { label: 'Payment Methods',     icon: '💳', onPress: () => Alert.alert('Coming soon', 'Saved payment methods will appear here in a future update.') },
    { label: 'Documents & Licence', icon: '📄', onPress: () => Alert.alert('Coming soon', 'Upload your driver\'s licence and insurance here.') },
    { label: 'Notifications',       icon: '🔔', onPress: () => {} },
    { label: 'Help & Support',      icon: '💬', onPress: () => {} },
  ];

  return (
    <SafeAreaView style={st.container}>
      <View style={st.header}>
        <View style={st.avatar}><Text style={st.avatarText}>{initials}</Text></View>
        <Text style={st.name}>{user?.fullName ?? 'Lake Pass User'}</Text>
        <Text style={st.email}>{user?.primaryEmailAddress?.emailAddress ?? ''}</Text>

        <View style={st.tabRow}>
          {(['menu','bookings','saved'] as Tab[]).map(t => (
            <TouchableOpacity key={t} onPress={() => setTab(t)}
              style={[st.tabBtn, tab === t && st.tabBtnActive]}>
              <Text style={[st.tabBtnText, tab === t && st.tabBtnTextActive]}>
                {t === 'menu' ? 'Menu' : t === 'bookings' ? 'Bookings' : 'Saved'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {tab === 'menu' && (
        <ScrollView>
          <View style={st.menuSection}>
            {MENU.map(item => (
              <TouchableOpacity key={item.label} style={st.menuItem} onPress={item.onPress} activeOpacity={0.7}>
                <Text style={st.menuIcon}>{item.icon}</Text>
                <Text style={st.menuLabel}>{item.label}</Text>
                <Text style={st.menuArrow}>›</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={st.menuSection}>
            <TouchableOpacity style={st.menuItem} onPress={handleSignOut} activeOpacity={0.7}>
              <Text style={st.menuIcon}>👋</Text>
              <Text style={[st.menuLabel, { color: '#dc2626', fontWeight: '600' }]}>Sign Out</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {tab === 'bookings' && (
        resLoading
          ? <ActivityIndicator style={{ marginTop: 48 }} color="#1d6fdb" />
          : reservations.length === 0
            ? <View style={st.empty}>
                <Text style={st.emptyText}>No reservations yet.</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/search')} style={st.emptyBtn}>
                  <Text style={st.emptyBtnText}>Browse boats →</Text>
                </TouchableOpacity>
              </View>
            : <FlatList data={reservations} keyExtractor={r => r.id}
                contentContainerStyle={{ padding: 16, gap: 10 }}
                renderItem={({ item: r }) => {
                  const sl = STATUS_CFG[r.status] ?? { text: r.status, color: '#6b7280' };
                  return (
                    <View style={st.card}>
                      <View style={st.cardTop}>
                        <Text style={st.cardBoat}>{r.boat?.name}</Text>
                        <View style={[st.badge, { backgroundColor: sl.color + '22' }]}>
                          <Text style={[st.badgeText, { color: sl.color }]}>{sl.text}</Text>
                        </View>
                      </View>
                      <Text style={st.cardMeta}>{r.boat?.marina?.name} · {r.boat?.type}</Text>
                      <Text style={st.cardDates}>{format(new Date(r.startDate),'MMM d')} – {format(new Date(r.endDate),'MMM d, yyyy')}</Text>
                      {r.totalAmount != null && <Text style={st.cardAmt}>${r.totalAmount.toFixed(2)}</Text>}
                    </View>
                  );
                }}
              />
      )}

      {tab === 'saved' && (
        favLoading
          ? <ActivityIndicator style={{ marginTop: 48 }} color="#1d6fdb" />
          : favorites.length === 0
            ? <View style={st.empty}>
                <Text style={st.emptyText}>No saved boats yet.</Text>
                <TouchableOpacity onPress={() => router.push('/(tabs)/search')} style={st.emptyBtn}>
                  <Text style={st.emptyBtnText}>Browse boats →</Text>
                </TouchableOpacity>
              </View>
            : <FlatList data={favorites} keyExtractor={b => b.id}
                contentContainerStyle={{ padding: 16, gap: 10 }}
                renderItem={({ item: b }) => (
                  <View style={st.card}>
                    <View style={st.cardTop}>
                      <Text style={st.cardBoat}>{b.name}</Text>
                      <TouchableOpacity onPress={() => removeFav.mutate(b.id)}>
                        <Text style={{ fontSize: 18 }}>❤️</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={st.cardMeta}>{b.marina?.lake} · {b.marina?.name} · {b.type}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                      <Text style={st.cardAmt}>${b.dailyRate}/day</Text>
                      <TouchableOpacity onPress={() => router.push(`/boat/${b.id}`)} style={st.bookSmallBtn}>
                        <Text style={st.bookSmallBtnText}>Book →</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              />
      )}
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#f8fafc' },
  header:          { backgroundColor: '#1d6fdb', padding: 24, alignItems: 'center', paddingBottom: 0 },
  avatar:          { width: 72, height: 72, borderRadius: 36, backgroundColor: '#bfdbfe', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  avatarText:      { fontSize: 24, fontWeight: '800', color: '#1d4ed8' },
  name:            { fontSize: 20, fontWeight: '700', color: '#fff' },
  email:           { fontSize: 13, color: '#bfdbfe', marginTop: 2 },
  tabRow:          { flexDirection: 'row', marginTop: 16, width: '100%' },
  tabBtn:          { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabBtnActive:    { borderBottomColor: '#fff' },
  tabBtnText:      { fontSize: 13, color: '#bfdbfe', fontWeight: '500' },
  tabBtnTextActive:{ color: '#fff', fontWeight: '700' },
  menuSection:     { margin: 16, backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden' },
  menuItem:        { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  menuIcon:        { fontSize: 20, width: 32 },
  menuLabel:       { flex: 1, fontSize: 15, color: '#111827' },
  menuArrow:       { fontSize: 20, color: '#9ca3af' },
  empty:           { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyText:       { fontSize: 16, color: '#9ca3af', marginBottom: 12 },
  emptyBtn:        { backgroundColor: '#1d6fdb', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12 },
  emptyBtnText:    { color: '#fff', fontWeight: '700', fontSize: 14 },
  card:            { backgroundColor: '#fff', borderRadius: 14, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, elevation: 1 },
  cardTop:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardBoat:        { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1 },
  badge:           { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3, marginLeft: 8 },
  badgeText:       { fontSize: 11, fontWeight: '600' },
  cardMeta:        { fontSize: 12, color: '#6b7280' },
  cardDates:       { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cardAmt:         { fontSize: 13, fontWeight: '700', color: '#111827', marginTop: 6 },
  bookSmallBtn:    { backgroundColor: '#1d6fdb', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  bookSmallBtnText:{ color: '#fff', fontWeight: '700', fontSize: 12 },
});
