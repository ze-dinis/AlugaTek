import React, {useCallback, useEffect, useState} from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {NativeStackScreenProps} from '@react-navigation/native-stack';
import {RootStackParamList} from '../../navigation/AppNavigator';
import {UserRentalReviewComment} from '../../types';
import {i18n} from '../../locales';
import {RentalReviewsSort, usersService} from '../../services/usersService';

type Props = NativeStackScreenProps<RootStackParamList, 'UserReviews'>;

const PAGE_SIZE = 10;

export default function UserReviewsScreen({route, navigation}: Props) {
  const {userId, userName} = route.params;
  const [reviews, setReviews] = useState<UserRentalReviewComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [sort, setSort] = useState<RentalReviewsSort>('recent');

  useEffect(() => {
    navigation.setOptions({
      title: i18n.userReviews.title(userName),
    });
  }, [navigation, userName]);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    try {
      const {data} = await usersService.getRentalReviews(userId, {
        limit: PAGE_SIZE,
        skip: 0,
        sort,
      });
      setReviews(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      setReviews([]);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [sort, userId]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      const {data} = await usersService.getRentalReviews(userId, {
        limit: PAGE_SIZE,
        skip: reviews.length,
        sort,
      });

      setReviews(prev => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loading, loadingMore, reviews.length, sort, userId]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const renderSortButton = (value: RentalReviewsSort, label: string) => (
    <TouchableOpacity
      style={[styles.sortButton, sort === value && styles.sortButtonActive]}
      onPress={() => setSort(value)}>
      <Text style={[styles.sortButtonText, sort === value && styles.sortButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.sortRow}>
        {renderSortButton('recent', i18n.userReviews.sortRecent)}
        {renderSortButton('highest', i18n.userReviews.sortHighest)}
        {renderSortButton('lowest', i18n.userReviews.sortLowest)}
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} size="large" color="#1a73e8" />
      ) : (
        <FlatList
          data={reviews}
          keyExtractor={review => review.id}
          contentContainerStyle={styles.list}
          onEndReached={() => {
            void loadMore();
          }}
          onEndReachedThreshold={0.5}
          renderItem={({item}) => (
            <View style={styles.card}>
              <Text style={styles.meta}>
                {'⭐ '}
                {item.rating.toFixed(1)}
                {' · '}
                {item.reviewer.name}
                {' · '}
                {new Date(item.createdAt).toLocaleDateString()}
              </Text>
              <Text style={styles.itemTitle}>{i18n.userReviews.itemLabel}: {item.itemTitle}</Text>
              {!!item.comment?.trim() && (
                <Text style={styles.comment}>{item.comment}</Text>
              )}
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>{i18n.userReviews.empty}</Text>}
          ListFooterComponent={
            hasMore ? (
              <TouchableOpacity
                style={[styles.loadMoreButton, loadingMore && styles.loadMoreButtonDisabled]}
                onPress={() => {
                  void loadMore();
                }}
                disabled={loadingMore}>
                <Text style={styles.loadMoreButtonText}>
                  {loadingMore ? i18n.userReviews.loadingMore : i18n.userReviews.loadMore}
                </Text>
              </TouchableOpacity>
            ) : reviews.length > 0 ? (
              <Text style={styles.endText}>{i18n.userReviews.end}</Text>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {flex: 1, backgroundColor: '#f8fafc'},
  loader: {flex: 1},
  sortRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sortButton: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  sortButtonActive: {
    backgroundColor: '#1a73e8',
    borderColor: '#1a73e8',
  },
  sortButtonText: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600',
  },
  sortButtonTextActive: {
    color: '#fff',
  },
  list: {
    paddingHorizontal: 14,
    paddingBottom: 18,
  },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 12,
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  meta: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  itemTitle: {
    marginTop: 5,
    fontSize: 12,
    color: '#64748b',
  },
  comment: {
    marginTop: 8,
    fontSize: 14,
    color: '#0f172a',
  },
  empty: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 28,
  },
  loadMoreButton: {
    marginTop: 6,
    alignSelf: 'center',
    backgroundColor: '#1a73e8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  loadMoreButtonDisabled: {
    opacity: 0.7,
  },
  loadMoreButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  endText: {
    textAlign: 'center',
    color: '#64748b',
    marginTop: 10,
  },
});
