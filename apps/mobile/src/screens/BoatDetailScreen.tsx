import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, ActivityIndicator, Image, Alert, TextInput,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Boat, Review } from '@lake-pass/shared';
import api from '@/lib/api';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { useAuth } from '@clerk/clerk-expo';

interface BoatDetail extends Boat {
  reviews: (Review & { user: { name: string } })[];
  marina: { id: string; name: string; lake: string; phone?: string };
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1,2,3,4,5].map(n => (
        <TouchableOpacity key={n} onPress={() => onChange?.(n)} disabled={!onChange}>
          <Text style={{ fontSize: 24, color: n <= value ? '#f59e0b' : '#e5e7eb' }}>★</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function BoatDetailScreen() {
  const { id }      = useLocalSearchParams<{ id: string }>();
  const router      = useRouter();
  const authedApi   = useAuthedApi();
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating]                 = useState(5);
  const [comment, setComment]               = useState('');
  const [favorited, setFavorited]           = useState(false);

  const { data: boat, isLoading, isError } = useQuery<BoatDetail>({
    queryKey: ['boat', id],
    queryFn:  () => api.get(`/boats/${id}`).then(r => r.data),
    enabled:  !!id,
  });

  const toggleFav = useMutation({
    mutationFn: () => authedApi.post(`/favorites/${id}`, {}).then(r => r.data),
    onSuccess: (d) => setFavorited(d.favorited),
    onError:   () => Alert.alert('Sign in required', 'Please sign in to save favorites.'),
  });

  const submitReview = useMutation({
    mutationFn: () => authedApi.post(`/boats/${id}/reviews`, { rating, comment }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['boat', id] });
      setShowReviewForm(false); setComment(''); setRating(5);
    },
    onError: (err: any) => Alert.alert('Error', err?.response?.data?.error ?? 'Could not submit review.'),
  });

  if (isLoading) return <SafeAreaView style={s.container}><ActivityIndicator style={{ flex:1 }} color="#1d6fdb" /></SafeAreaView>;
  if (isError || !boat) return <SafeAreaView style={s.container}><Text style={s.errTxt}>Couldn't load this boat.</Text></SafeAreaView>;

  const avgRating = boat.reviews?.length
    ? (boat.reviews.reduce((sum, r) => sum + r.rating, 0) / boat.reviews.length).toFixed(1)
    : null;

  return (
    <SafeAreaView style={s.container}>
      <ScrollView contentContainerStyle={s.content}>
        {/* Photo */}
        {boat.photoUrls?.[0]
          ? <Image source={{ uri: boat.photoUrls[0] }} style={s.img} resizeMode="cover" />
          : <View style={[s.img, s.imgPlaceholder]}><Text style={{ fontSize: 48 }}>⛵</Text></View>
        }

        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.name}>{boat.name}</Text>
            <Text style={s.meta}>{boat.type} · {boat.capacity} guests · {boat.marina?.name}</Text>
            {avgRating && (
              <Text style={s.rating}>★ {avgRating} ({boat.reviews.length} review{boat.reviews.length !== 1 ? 's' : ''})</Text>
            )}
          </View>
          <TouchableOpacity onPress={() => toggleFav.mutate()} style={s.favBtn}>
            <Text style={{ fontSize: 24 }}>{favorited ? '❤️' : '🤍'}</Text>
          </TouchableOpacity>
        </View>

        {boat.description && <Text style={s.desc}>{boat.description}</Text>}

        {(boat.amenities ?? []).length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Amenities</Text>
            <View style={s.chips}>
              {boat.amenities.map(a => (
                <View key={a} style={s.chip}><Text style={s.chipText}>{a}</Text></View>
              ))}
            </View>
          </View>
        )}

        {/* Photos carousel */}
        {(boat.photoUrls ?? []).length > 1 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {boat.photoUrls.map((url, i) => (
                <Image key={i} source={{ uri: url }} style={s.thumb} resizeMode="cover" />
              ))}
            </ScrollView>
          </View>
        )}

        {/* Reviews */}
        <View style={s.section}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={s.sectionTitle}>Reviews</Text>
            {isSignedIn && !showReviewForm && (
              <TouchableOpacity onPress={() => setShowReviewForm(true)}>
                <Text style={{ color: '#1d6fdb', fontSize: 13, fontWeight: '600' }}>+ Write a review</Text>
              </TouchableOpacity>
            )}
          </View>

          {showReviewForm && (
            <View style={s.reviewForm}>
              <Text style={s.fieldLabel}>Your rating</Text>
              <StarRating value={rating} onChange={setRating} />
              <Text style={[s.fieldLabel, { marginTop: 12 }]}>Comment (optional)</Text>
              <TextInput
                value={comment} onChangeText={setComment} multiline numberOfLines={3}
                placeholder="How was your experience?"
                style={s.textArea}
              />
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <TouchableOpacity onPress={() => setShowReviewForm(false)} style={[s.btn, s.btnSecondary]}>
                  <Text style={s.btnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => submitReview.mutate()} disabled={submitReview.isPending}
                  style={[s.btn, s.btnPrimary, submitReview.isPending && { opacity: 0.6 }]}>
                  <Text style={s.btnPrimaryText}>{submitReview.isPending ? 'Submitting…' : 'Submit'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {(boat.reviews ?? []).length === 0 && !showReviewForm && (
            <Text style={s.emptyReviews}>No reviews yet. Be the first!</Text>
          )}

          {(boat.reviews ?? []).slice(0, 10).map(r => (
            <View key={r.id} style={s.review}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={s.reviewAuthor}>{r.user?.name}</Text>
                <StarRating value={r.rating} />
              </View>
              {r.comment && <Text style={s.reviewComment}>{r.comment}</Text>}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <View style={{ flex: 1 }}>
          <Text style={s.price}>${boat.dailyRate}<Text style={s.priceSuffix}>/day</Text></Text>
          {boat.hourlyRate && <Text style={s.priceHour}>${boat.hourlyRate}/hr also available</Text>}
        </View>
        <TouchableOpacity
          style={[s.bookBtn, boat.status !== 'available' && s.bookBtnOff]}
          disabled={boat.status !== 'available'}
          onPress={() => router.push(`/booking/${boat.id}`)}
          activeOpacity={0.85}>
          <Text style={s.bookBtnText}>{boat.status === 'available' ? 'Book Now' : 'Unavailable'}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: '#f8fafc' },
  content:       { paddingBottom: 100 },
  img:           { width: '100%', height: 240 },
  imgPlaceholder:{ backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  header:        { flexDirection: 'row', alignItems: 'flex-start', padding: 16 },
  name:          { fontSize: 22, fontWeight: '800', color: '#111827' },
  meta:          { fontSize: 13, color: '#6b7280', marginTop: 3 },
  rating:        { fontSize: 13, color: '#f59e0b', fontWeight: '600', marginTop: 4 },
  favBtn:        { padding: 8 },
  desc:          { fontSize: 14, color: '#374151', lineHeight: 22, paddingHorizontal: 16, marginBottom: 4 },
  section:       { padding: 16, paddingTop: 0 },
  sectionTitle:  { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 10 },
  chips:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:          { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  chipText:      { fontSize: 12, color: '#374151' },
  thumb:         { width: 120, height: 80, borderRadius: 10, marginRight: 10 },
  reviewForm:    { backgroundColor: '#f9fafb', borderRadius: 12, padding: 14, marginBottom: 12 },
  fieldLabel:    { fontSize: 12, fontWeight: '600', color: '#6b7280', marginBottom: 6 },
  textArea:      { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 10, fontSize: 14, color: '#111827', minHeight: 80, textAlignVertical: 'top', backgroundColor: '#fff' },
  btn:           { flex: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  btnPrimary:    { backgroundColor: '#1d6fdb' },
  btnPrimaryText:{ color: '#fff', fontWeight: '700', fontSize: 14 },
  btnSecondary:  { borderWidth: 1, borderColor: '#e5e7eb' },
  btnSecondaryText: { fontSize: 14, color: '#374151' },
  emptyReviews:  { fontSize: 13, color: '#9ca3af' },
  review:        { borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 12, marginTop: 12 },
  reviewAuthor:  { fontSize: 13, fontWeight: '600', color: '#111827' },
  reviewComment: { fontSize: 13, color: '#374151', marginTop: 4, lineHeight: 20 },
  errTxt:        { textAlign: 'center', color: '#9ca3af', marginTop: 80 },
  footer:        { padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', gap: 12 },
  price:         { fontSize: 22, fontWeight: '800', color: '#111827' },
  priceSuffix:   { fontSize: 13, fontWeight: '400', color: '#6b7280' },
  priceHour:     { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  bookBtn:       { backgroundColor: '#1d6fdb', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center' },
  bookBtnOff:    { backgroundColor: '#9ca3af' },
  bookBtnText:   { color: '#fff', fontSize: 15, fontWeight: '700' },
});
