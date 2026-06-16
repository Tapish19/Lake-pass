import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSignIn } from '@clerk/clerk-expo';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { registerForPushNotifications } from '@/lib/pushNotifications';

export default function SignInScreen() {
  const { signIn, setActive, isLoaded } = useSignIn();
  const authedApi = useAuthedApi();
  const router    = useRouter();

  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSignIn = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const attempt = await signIn.create({ identifier: email, password });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });

        // Sync user to backend DB (idempotent upsert)
        try {
          await authedApi.post('/auth/sync', { name: email.split('@')[0], email });
        } catch { /* non-fatal */ }

        // Register for push notifications
        try {
          const pushToken = await registerForPushNotifications();
          if (pushToken) await authedApi.patch('/auth/me/push-token', { token: pushToken });
        } catch { /* non-fatal */ }

        router.replace('/(tabs)');
      } else {
        Alert.alert('Additional step required', 'Please complete sign-in from a supported method.');
      }
    } catch (err: any) {
      Alert.alert('Sign in failed', err?.errors?.[0]?.message ?? 'Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={st.container}>
      <View style={st.content}>
        <Text style={st.logo}>Lake Pass</Text>
        <Text style={st.subtitle}>Sign in to find and book your next boat</Text>

        <Text style={st.label}>Email</Text>
        <TextInput style={st.input} autoCapitalize="none" keyboardType="email-address"
          placeholder="you@example.com" value={email} onChangeText={setEmail} />

        <Text style={st.label}>Password</Text>
        <TextInput style={st.input} secureTextEntry placeholder="••••••••"
          value={password} onChangeText={setPassword} />

        <TouchableOpacity style={st.btn} onPress={handleSignIn} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Sign In</Text>}
        </TouchableOpacity>

        <Link href="/(auth)/sign-up" style={st.link}>
          <Text style={st.linkText}>Don&apos;t have an account? Sign up</Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content:   { flex: 1, padding: 24, justifyContent: 'center' },
  logo:      { fontSize: 32, fontWeight: '800', color: '#1d6fdb', textAlign: 'center' },
  subtitle:  { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 6, marginBottom: 32 },
  label:     { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
  input:     { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff' },
  btn:       { backgroundColor: '#1d6fdb', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  link:      { marginTop: 16, alignItems: 'center' },
  linkText:  { color: '#1d6fdb', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
