import React, {useEffect, useState} from 'react';
import {
  Image,
  ImageProps,
  ImageSourcePropType,
  StyleSheet,
  Text,
  View,
} from 'react-native';

type SafeImageProps = Omit<ImageProps, 'source'> & {
  uri?: string | null;
  fallbackSource?: ImageSourcePropType;
};

export default function SafeImage({
  uri,
  fallbackSource,
  onError,
  style,
  ...rest
}: SafeImageProps) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [uri]);

  if (!uri || hasError) {
    if (fallbackSource) {
      return (
        <Image
          {...rest}
          style={style}
          source={fallbackSource}
          onError={event => {
            onError?.(event);
          }}
        />
      );
    }

    const flattenedStyle = StyleSheet.flatten(style) ?? {};

    return (
      <View
        style={[
          styles.placeholder,
          {
            width: flattenedStyle.width,
            height: flattenedStyle.height,
            borderRadius: flattenedStyle.borderRadius,
          },
        ]}>
        <Text style={styles.placeholderText}>Sem imagem</Text>
      </View>
    );
  }

  return (
    <Image
      {...rest}
      style={style}
      source={{uri}}
      onError={event => {
        setHasError(true);
        onError?.(event);
      }}
    />
  );
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: '#e8edf5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5b6575',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
});