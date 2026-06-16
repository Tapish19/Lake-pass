import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator, Linking, Switch,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation } from '@tanstack/react-query';
import { addDays, differenceInCalendarDays, format } from 'date-fns';
import type { Boat } from '@lake-pass/shared';
import api from '@/lib/api';
import { useAuthedApi } from '@/lib/useAuthedApi';

const PLATFORM_FEE_RATE = 0.1;

interface Addon { id: string; name: string; price: number; description?: string }

type Step = 'dates' | 'addons' | 'waiver' | 'review';
const STEPS: Step[] = ['dates', 'addons', 'waiver', 'review'];
const STEP_LABELS = ['Dates', 'Add-ons', 'Waiver', 'Review'];

const WAIVER_TEXT = `BOAT RENTAL WAIVER & RELEASE OF LIABILITY

By agreeing below, I acknowledge that I am renting a watercraft from the marina listed above ("Marina") through Lake Pass ("Platform"). I understand and agree that:

1. ASSUMPTION OF RISK: Boating involves inherent risks including capsizing, collision, drowning, and injury. I voluntarily assume all such risks.

2. RELEASE: I release and hold harmless the Marina, Lake Pass, and their respective agents from any and all claims, damages, or losses arising from my use of the rented watercraft.

3. SAFE OPERATION: I will operate the watercraft safely, comply with all applicable laws, and will not operate under the influence of alcohol or drugs.

4. DAMAGE: I am responsible for any damage to the watercraft beyond normal wear and tear.

5. MINIMUM AGE: I confirm I am at least 18 years of age and hold a valid driver's license.

By checking the box below, I confirm I have read, understood, and agree to all terms above.`;

export default function BookingScreen() {
  const { boatId } = useLocalSearchParams<{ boatId: string }>();
  const router     = useRouter();
  const authedApi  = useAuthedApi();

  const [step, setStep]             = useState<Step>('dates');
  const [startDate, setStartDate]   = useState(() => addDays(new Date(), 1));
  const [nights, setNights]         = useState(1);
  const [selectedAddons, setSelectedAddons] = useState<string[]>([]);
  const [waiverAgreed, setWaiverAgreed]     = useState(false);

  const endDate = addDays(startDate, nights);
  const stepIdx = STEPS.indexOf(step);

  const { data: boat, isLoading: boatLoading } = useQuery<Boat>({
    queryKey: ['boat', boatId],
    queryFn:  () => api.get(`/boats/${boatId}`).then(r => r.data),
    enabled:  !!boatId,
  });

  const { data: addons = [] } = useQuery<Addon[]>({
    queryKey: ['addons', (boat as any)?.marina?.id],
    queryFn:  () => api.get(`/addons?marinaId=${(boat as any)?.marina?.id}`).then(r => r.data),
    enabled:  !!(boat as any)?.marina?.id,
  });

  const bookingMutation = useMutation({
    mutationFn: async () => {
      // 1. Create reservation (with add-ons so pricing is correct)
      const reservation = await authedApi.post('/reservations', {
        boatId,
        startDate:  startDate.toISOString(),
        endDate:    endDate.toISOString(),
        addonIds:   selectedAddons,
      }).then(r => r.data);

      // 2. Sign waiver (IP captured server-side)
      await authedApi.post('/reservations/sign-waiver', {
        reservationId: reservation.id,
        signerName:    'self',
        agreed:        true,
      });

      // 3. Create Stripe checkout session
      const checkout = await authedApi.post('/payments/checkout', {
        reservationId: reservation.id,
      }).then(r => r.data);

      return checkout as { url: string };
    },
    onSuccess: async ({ url }) => { if (url) await Linking.openURL(url); },
    onError:   (err: any) => Alert.alert('Booking failed', err?.response?.data?.error ?? 'Something went wrong.'),
  });

  if (boatLoading || !boat) return (
    <SafeAreaView style={st.container}><ActivityIndicator style={{ flex: 1 }} color="#1d6fdb" /></SafeAreaView>
  );

  const rentalAmt  = boat.dailyRate * nights;
  const addonAmt   = selectedAddons.reduce((sum, id) => {
    const a = addons.find(x => x.id === id);
    return sum + (a?.price ?? 0);
  }, 0);
  const platformFee = Math.round((rentalAmt + addonAmt) * PLATFORM_FEE_RATE * 100) / 100;
  const total       = rentalAmt + addonAmt + platformFee;

  return (
    <SafeAreaView style={st.container}>
      {/* Step indicator */}
      <View style={st.stepRow}>
        {STEP_LABELS.map((label, i) => (
          <View key={label} style={st.stepItem}>
            <View style={[st.stepDot, i <= stepIdx && st.stepDotActive]}>
              <Text style={st.stepNum}>{i+1}</Text>
            </View>
            <Text style={[st.stepLabel, i <= stepIdx && st.stepLabelActive]}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView contentContainerStyle={st.content}>
        <Text style={st.title}>{boat.name}</Text>

        {/* ── STEP: DATES ── */}
        {step === 'dates' && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Select Dates</Text>
            <View style={st.row}>
              <View style={st.dateBox}>
                <Text style={st.dateLabel}>Start date</Text>
                <Text style={st.dateVal}>{format(startDate,'MMM d, yyyy')}</Text>
                <View style={st.stepperRow}>
                  <TouchableOpacity style={st.stepperBtn} onPress={() => setStartDate(d => addDays(d,-1))}><Text style={st.stepperTxt}>−</Text></TouchableOpacity>
                  <TouchableOpacity style={st.stepperBtn} onPress={() => setStartDate(d => addDays(d,1))}><Text style={st.stepperTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
              <View style={st.dateBox}>
                <Text style={st.dateLabel}>Nights</Text>
                <Text style={st.dateVal}>{nights}</Text>
                <View style={st.stepperRow}>
                  <TouchableOpacity style={st.stepperBtn} onPress={() => setNights(n => Math.max(1,n-1))}><Text style={st.stepperTxt}>−</Text></TouchableOpacity>
                  <TouchableOpacity style={st.stepperBtn} onPress={() => setNights(n => n+1)}><Text style={st.stepperTxt}>+</Text></TouchableOpacity>
                </View>
              </View>
            </View>
            <Text style={st.helperTxt}>
              {differenceInCalendarDays(endDate,startDate)} day{nights>1?'s':''}, returning {format(endDate,'MMM d, yyyy')}
            </Text>
          </View>
        )}

        {/* ── STEP: ADD-ONS ── */}
        {step === 'addons' && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Add-ons</Text>
            {addons.length === 0 && <Text style={st.emptyTxt}>No add-ons available from this marina.</Text>}
            {addons.map(addon => {
              const active = selectedAddons.includes(addon.id);
              return (
                <TouchableOpacity key={addon.id} onPress={() => setSelectedAddons(prev =>
                  prev.includes(addon.id) ? prev.filter(id => id !== addon.id) : [...prev, addon.id]
                )} style={[st.addonRow, active && st.addonRowActive]} activeOpacity={0.7}>
                  <View style={{ flex: 1 }}>
                    <Text style={[st.addonName, active && st.addonNameActive]}>{addon.name}</Text>
                    {addon.description && <Text style={st.addonDesc}>{addon.description}</Text>}
                  </View>
                  <Text style={[st.addonPrice, active && st.addonPriceActive]}>+${addon.price}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* ── STEP: WAIVER ── */}
        {step === 'waiver' && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Liability Waiver</Text>
            <ScrollView style={st.waiverScroll} nestedScrollEnabled>
              <Text style={st.waiverText}>{WAIVER_TEXT}</Text>
            </ScrollView>
            <View style={st.waiverCheck}>
              <Switch value={waiverAgreed} onValueChange={setWaiverAgreed} trackColor={{ true: '#1d6fdb' }} />
              <Text style={st.waiverCheckLabel}>I have read and agree to the waiver above</Text>
            </View>
          </View>
        )}

        {/* ── STEP: REVIEW ── */}
        {step === 'review' && (
          <View style={st.card}>
            <Text style={st.cardTitle}>Price Summary</Text>
            {[
              { label: `Boat rental (${nights} night${nights>1?'s':''})`, value: `$${rentalAmt.toFixed(2)}` },
              ...selectedAddons.map(id => {
                const a = addons.find(x => x.id === id);
                return { label: a?.name ?? id, value: `+$${a?.price.toFixed(2) ?? '0.00'}` };
              }),
              { label: 'Platform fee (10%)', value: `$${platformFee.toFixed(2)}` },
            ].map(l => (
              <View key={l.label} style={st.priceLine}>
                <Text style={st.priceLabel}>{l.label}</Text>
                <Text style={st.priceValue}>{l.value}</Text>
              </View>
            ))}
            <View style={[st.priceLine, st.priceTotal]}>
              <Text style={st.priceTotalLabel}>Total</Text>
              <Text style={st.priceTotalValue}>${total.toFixed(2)}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Navigation */}
      <View style={st.navRow}>
        {stepIdx > 0 && (
          <TouchableOpacity style={st.backBtn} onPress={() => setStep(STEPS[stepIdx-1])}>
            <Text style={st.backBtnTxt}>Back</Text>
          </TouchableOpacity>
        )}
        {step !== 'review' ? (
          <TouchableOpacity
            style={[st.nextBtn, step==='waiver' && !waiverAgreed && st.nextBtnOff]}
            disabled={step === 'waiver' && !waiverAgreed}
            onPress={() => setStep(STEPS[stepIdx+1])}>
            <Text style={st.nextBtnTxt}>Continue</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[st.bookBtn, bookingMutation.isPending && st.bookBtnOff]}
            onPress={() => bookingMutation.mutate()}
            disabled={bookingMutation.isPending}>
            {bookingMutation.isPending
              ? <ActivityIndicator color="#fff" />
              : <Text style={st.bookBtnTxt}>Confirm &amp; Pay · ${total.toFixed(2)}</Text>
            }
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#f8fafc' },
  stepRow:        { flexDirection: 'row', justifyContent: 'center', gap: 24, padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  stepItem:       { alignItems: 'center', gap: 4 },
  stepDot:        { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  stepDotActive:  { backgroundColor: '#1d6fdb' },
  stepNum:        { color: '#fff', fontSize: 12, fontWeight: '700' },
  stepLabel:      { fontSize: 10, color: '#9ca3af' },
  stepLabelActive:{ color: '#1d6fdb', fontWeight: '600' },
  content:        { padding: 16, paddingBottom: 120 },
  title:          { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 16 },
  card:           { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12 },
  cardTitle:      { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 14 },
  row:            { flexDirection: 'row', gap: 12 },
  dateBox:        { flex: 1, backgroundColor: '#f1f5f9', borderRadius: 12, padding: 12 },
  dateLabel:      { fontSize: 11, color: '#6b7280' },
  dateVal:        { fontSize: 15, fontWeight: '600', color: '#111827' },
  stepperRow:     { flexDirection: 'row', gap: 8, marginTop: 8 },
  stepperBtn:     { width: 32, height: 32, borderRadius: 8, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb', alignItems: 'center', justifyContent: 'center' },
  stepperTxt:     { fontSize: 16, fontWeight: '700', color: '#1d6fdb' },
  helperTxt:      { fontSize: 12, color: '#9ca3af', marginTop: 10 },
  addonRow:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 14, marginBottom: 8 },
  addonRowActive: { borderColor: '#1d6fdb', backgroundColor: '#eff6ff' },
  addonName:      { fontSize: 14, fontWeight: '600', color: '#374151' },
  addonNameActive:{ color: '#1d6fdb' },
  addonDesc:      { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  addonPrice:     { fontSize: 14, color: '#6b7280', fontWeight: '600' },
  addonPriceActive:{ color: '#1d6fdb' },
  emptyTxt:       { fontSize: 13, color: '#9ca3af' },
  waiverScroll:   { maxHeight: 240, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, marginBottom: 14, backgroundColor: '#f9fafb' },
  waiverText:     { fontSize: 12, color: '#374151', lineHeight: 20 },
  waiverCheck:    { flexDirection: 'row', alignItems: 'center', gap: 12 },
  waiverCheckLabel:{ flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },
  priceLine:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  priceLabel:     { fontSize: 14, color: '#6b7280' },
  priceValue:     { fontSize: 14, color: '#111827' },
  priceTotal:     { borderTopWidth: 1, borderTopColor: '#f1f5f9', marginTop: 8, paddingTop: 12 },
  priceTotalLabel:{ fontSize: 16, fontWeight: '700', color: '#111827' },
  priceTotalValue:{ fontSize: 16, fontWeight: '800', color: '#1d6fdb' },
  navRow:         { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', gap: 12, padding: 16, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  backBtn:        { flex: 1, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  backBtnTxt:     { fontSize: 15, color: '#374151', fontWeight: '600' },
  nextBtn:        { flex: 2, backgroundColor: '#1d6fdb', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  nextBtnOff:     { backgroundColor: '#9ca3af' },
  nextBtnTxt:     { color: '#fff', fontSize: 15, fontWeight: '700' },
  bookBtn:        { flex: 2, backgroundColor: '#1d6fdb', borderRadius: 14, paddingVertical: 16, alignItems: 'center' },
  bookBtnOff:     { opacity: 0.6 },
  bookBtnTxt:     { color: '#fff', fontSize: 15, fontWeight: '800' },
});
