import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { isImageUrl } from '../lib/storage';

interface Props {
  value?: string | null;
  size: number;
  backgroundColor?: string;
  borderColor?: string;
  textSize?: number;
}

export default function AvatarImage({ value, size, backgroundColor, borderColor, textSize }: Props) {
  const radius = size / 2;
  const imageUrl = value ?? '';

  if (isImageUrl(imageUrl)) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius: radius,
            borderColor: borderColor ?? 'transparent',
          },
        ]}
      />
    );
  }

  return (
    <View
      style={[
        styles.emojiWrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor,
          borderColor: borderColor ?? 'transparent',
        },
      ]}
    >
      <Text style={{ fontSize: textSize ?? Math.round(size * 0.48) }}>{value || '👤'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  image: { borderWidth: 2, backgroundColor: '#F0EEFF' },
  emojiWrap: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
  },
});
