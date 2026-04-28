import React from 'react';
import { View, Text } from 'react-native';
import * as AuthSession from 'expo-auth-session';

export default function Check() {
  const uri = AuthSession.makeRedirectUri();
  return (
    <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
      <Text style={{fontSize: 20}}>Redirect URI:</Text>
      <Text style={{fontSize: 16, color: 'blue', marginTop: 10}}>{uri}</Text>
    </View>
  );
}
