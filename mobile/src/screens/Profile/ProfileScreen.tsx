import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert, Image, ScrollView} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {getMessaging, getToken} from '@react-native-firebase/messaging';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {useAuthStore} from '../../store/authStore';
import {pushTokenService} from '../../services/pushTokenService';
import {i18n} from '../../locales';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

export default function ProfileScreen() {
  const {user, logout} = useAuthStore();
  const navigation = useNavigation<NavigationProp>();
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatarUrl]);

  const handleLogout = () => {
    Alert.alert(i18n.profile.logout, i18n.common.cancel ? 'Tem a certeza?' : '', [
      {text: i18n.common.cancel, style: 'cancel'},
      {
        text: i18n.profile.signOut,
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await getToken(getMessaging());
            if (token) {
              await pushTokenService.unregisterDeviceToken(token);
            }
          } catch {
            // silently fail
          }

          await logout();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {user?.avatarUrl && !avatarError ? (
        <Image
          source={{uri: user.avatarUrl}}
          style={styles.avatar}
          onError={() => setAvatarError(true)}
        />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarInitial}>{user?.name?.[0]?.toUpperCase()}</Text>
        </View>
      )}

      <Text style={styles.name}>{user?.name}</Text>
      <Text style={styles.email}>{user?.email}</Text>
      {user?.phone && <Text style={styles.phone}>{user.phone}</Text>}

      <TouchableOpacity style={styles.myItemsButton} onPress={() => navigation.navigate('MyItems')}>
        <Text style={styles.myItemsText}>{i18n.navigation.myItems}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>{i18n.profile.signOut}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {alignItems: 'center', paddingTop: 60, paddingBottom: 40, backgroundColor: '#fff', flexGrow: 1},
  avatar: {width: 96, height: 96, borderRadius: 48},
  avatarPlaceholder: {width: 96, height: 96, borderRadius: 48, backgroundColor: '#1a73e8', justifyContent: 'center', alignItems: 'center'},
  avatarInitial: {color: '#fff', fontSize: 36, fontWeight: 'bold'},
  name: {fontSize: 22, fontWeight: 'bold', marginTop: 16},
  email: {color: '#666', marginTop: 4},
  phone: {color: '#666', marginTop: 2},
  myItemsButton: {marginTop: 28, borderWidth: 1, borderColor: '#1a73e8', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 12},
  myItemsText: {color: '#1a73e8', fontWeight: '600', fontSize: 16},
  logoutButton: {marginTop: 40, borderWidth: 1, borderColor: '#f44336', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 12},
  logoutText: {color: '#f44336', fontWeight: '600', fontSize: 16},
});
