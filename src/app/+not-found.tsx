import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { colors } from '../theme';
export default function NotFound() { return <View style={{flex:1,justifyContent:'center',alignItems:'center',gap:24}}><Text style={{color:colors.text,fontSize:22}}>Esta página não está disponível.</Text><Pressable accessibilityRole="button" onPress={()=>router.replace('/')}><Text style={{color:colors.accent}}>Voltar ao início</Text></Pressable></View>; }
