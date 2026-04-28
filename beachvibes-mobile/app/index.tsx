import { Redirect } from 'expo-router';
import { useAuth } from '../src/auth/AuthProvider';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '../src/theme/colors';

export default function Index() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.bgPrimary }}>
        <ActivityIndicator size="large" color={Colors.brandPrimary} />
      </View>
    );
  }

  if (isAuthenticated) {
    return <Redirect href="/(tabs)/feed" />;
  }

  return <Redirect href="/login" />;
}
