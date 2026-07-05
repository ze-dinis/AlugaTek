import React, {useEffect, useState} from 'react';
import {View, Text, TouchableOpacity, StyleSheet, Alert, Image} from 'react-native';
import {useAuthStore} from '../../store/authStore';
import {i18n} from '../../locales';

export default function ProfileScreen() {
  const {user, logout} = useAuthStore();
  const [avatarError, setAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
  }, [user?.avatarUrl]);

  const handleLogout = () => {
    Alert.alert(i18n.profile.logout, i18n.common.cancel ? 'Are you sure?' : '', [
      {text: i18n.common.cancel, style: 'cancel'},
      {text: i18n.profile.signOut, style: 'destructive', onPress: logout},
    ]);
  };

  return (
    <View style={styles.container}>
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

      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutText}>{i18n.profile.signOut}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, alignItems: 'center', paddingTop: 60, backgroundColor: '#fff'},
  avatar: {width: 96, height: 96, borderRadius: 48},
  avatarPlaceholder: {width: 96, height: 96, borderRadius: 48, backgroundColor: '#1a73e8', justifyContent: 'center', alignItems: 'center'},
  avatarInitial: {color: '#fff', fontSize: 36, fontWeight: 'bold'},
  name: {fontSize: 22, fontWeight: 'bold', marginTop: 16},
  email: {color: '#666', marginTop: 4},
  phone: {color: '#666', marginTop: 2},
  logoutButton: {marginTop: 40, borderWidth: 1, borderColor: '#f44336', borderRadius: 8, paddingHorizontal: 32, paddingVertical: 12},
  logoutText: {color: '#f44336', fontWeight: '600', fontSize: 16},
});
