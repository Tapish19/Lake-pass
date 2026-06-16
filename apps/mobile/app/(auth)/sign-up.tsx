import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, Alert, ActivityIndicator,
} from 'react-native';
import { useRouter, Link } from 'expo-router';
import { useSignUp } from '@clerk/clerk-expo';
import { useAuthedApi } from '@/lib/useAuthedApi';
import { registerForPushNotifications } from '@/lib/pushNotifications';

export default function SignUpScreen() {
  const { signUp, setActive, isLoaded } = useSignUp();
  const authedApi = useAuthedApi();
  const router    = useRouter();

  const [name,                setName]                = useState('');
  const [email,               setEmail]               = useState('');
  const [password,            setPassword]            = useState('');
  const [code,                setCode]                = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading,             setLoading]             = useState(false);

  const handleSignUp = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      await signUp.create({ emailAddress: email, password, firstName: name });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      Alert.alert('Sign up failed', err?.errors?.[0]?.message ?? 'Please check your details.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const attempt = await signUp.attemptEmailAddressVerification({ code });
      if (attempt.status === 'complete') {
        await setActive({ session: attempt.createdSessionId });

        // Create backend User row (critical — without this, consumer endpoints return 403)
        try {
          await authedApi.post('/auth/sync', { name: name || email.split('@')[0], email });
        } catch { /* non-fatal */ }

        // Register for push notifications
        try {
          const pushToken = await registerForPushNotifications();
          if (pushToken) await authedApi.patch('/auth/me/push-token', { token: pushToken });
        } catch { /* non-fatal */ }

        router.replace('/(tabs)');
      } else {
        Alert.alert('Verification incomplete', 'Please double-check the code and try again.');
      }
    } catch (err: any) {
      Alert.alert('Verification failed', err?.errors?.[0]?.message ?? 'Invalid code.');
    } finally {
      setLoading(false);
    }
  };

  if (pendingVerification) {
    return (
      <SafeAreaView style={st.container}>
        <View style={st.content}>
          <Text style={st.title}>Check your email</Text>
          <Text style={st.subtitle}>We sent a 6-digit code to {email}</Text>
          <Text style={st.label}>Code</Text>
          <TextInput style={st.input} keyboardType="number-pad" placeholder="123456"
            value={code} onChangeText={setCode} />
          <TouchableOpacity style={st.btn} onPress={handleVerify} disabled={loading} activeOpacity={0.85}>
            {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Verify &amp; Continue</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={st.container}>
      <View style={st.content}>
        <Text style={st.title}>Create your account</Text>
        <Text style={st.subtitle}>Book boats across our partner marinas</Text>

        <Text style={st.label}>Name</Text>
        <TextInput style={st.input} placeholder="Jane Boater" value={name} onChangeText={setName} />

        <Text style={st.label}>Email</Text>
        <TextInput style={st.input} autoCapitalize="none" keyboardType="email-address"
          placeholder="you@example.com" value={email} onChangeText={setEmail} />

        <Text style={st.label}>Password</Text>
        <TextInput style={st.input} secureTextEntry placeholder="••••••••" value={password} onChangeText={setPassword} />

        <TouchableOpacity style={st.btn} onPress={handleSignUp} disabled={loading} activeOpacity={0.85}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={st.btnText}>Sign Up</Text>}
        </TouchableOpacity>

        <Link href="/(auth)/sign-in" style={st.link}>
          <Text style={st.linkText}>Already have an account? Sign in</Text>
        </Link>
      </View>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content:   { flex: 1, padding: 24, justifyContent: 'center' },
  title:     { fontSize: 28, fontWeight: '800', color: '#111827', textAlign: 'center' },
  subtitle:  { fontSize: 14, color: '#6b7280', textAlign: 'center', marginTop: 6, marginBottom: 32 },
  label:     { fontSize: 12, fontWeight: '600', color: '#6b7280', textTransform: 'uppercase', marginBottom: 6, marginTop: 12 },
  input:     { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, backgroundColor: '#fff' },
  btn:       { backgroundColor: '#1d6fdb', borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 24 },
  btnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  link:      { marginTop: 16, alignItems: 'center' },
  linkText:  { color: '#1d6fdb', fontSize: 13, fontWeight: '600', textAlign: 'center' },
});
