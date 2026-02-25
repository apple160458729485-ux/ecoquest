import { GoogleGenerativeAI } from "@google/generative-ai";
import { CameraView, useCameraPermissions } from 'expo-camera';
import { initializeApp } from "firebase/app";
import { getDatabase, onValue, push, ref } from "firebase/database";
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// ★ 画像をインポート (assetsフォルダに shujug.png がある前提)
import ShugoJu from '../../assets/shujug.png';

// --- 地図のWeb対応設定 ---
let MapView: any, Marker: any;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
} else {
  MapView = ({ children, style }: any) => (
    <View style={[style, { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{color: '#888', textAlign: 'center', padding: 20}}>
        【Web版】マップは準備中です。{"\n"}スマホアプリ版で地図が表示されます。
      </Text>
    </View>
  );
  Marker = () => null;
}

const genAI = new GoogleGenerativeAI("AIzaSyBydO6RU-hLZV_Fu690t0AJOsSjWFilcRw");
const firebaseConfig = { 
  apiKey: "AIzaSyBydO6RU-hLZV_Fu690t0AJOsSjWFilcRw",
  authDomain: "ecoquest-fb12a.firebaseapp.com",
  databaseURL: "https://ecoquest-fb12a-default-rtdb.firebaseio.com",
  projectId: "ecoquest-fb12a",
  appId: "1:930348078549:web:cdd265b30b348a793a995c",
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function EcoQuestFinal() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'MAP' | 'CAMERA'>('MAP');
  const [markers, setMarkers] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const cameraRef = useRef<any>(null);

  useEffect(() => {
    const markersRef = ref(db, 'markers/');
    onValue(markersRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const list = Object.keys(data).map(key => ({ id: key, ...data[key] }));
        setMarkers(list);
      }
    });
  }, []);

  const analyzeImageWithGemini = async (base64Photo: string) => {
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
    const prompt = "この画像にあるゴミを特定し、'素材名'だけを1単語で日本語で答えてください";
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Photo, mimeType: "image/jpeg" } }
    ]);
    return result.response.text();
  };

  const handlePress = async () => {
    if (mode === 'MAP') {
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) return;
      }
      setMode('CAMERA');
    } else {
      handleCaptureAndUpload();
    }
  };

  const handleCaptureAndUpload = async () => {
    if (cameraRef.current && !isAnalyzing) {
      try {
        setIsAnalyzing(true);
        const photo = await cameraRef.current.takePictureAsync({ base64: true });
        const trashType = await analyzeImageWithGemini(photo.base64);
        
        await push(ref(db, 'markers/'), {
          lat: 35.6812, lng: 139.7671, // 簡易化のため固定値
          type: trashType.trim(),
          timestamp: Date.now()
        });

        setIsAnalyzing(false);
        Alert.alert("鑑定完了！", `守護獣が「${trashType.trim()}」を認識しました！`);
        setMode('MAP');
      } catch (error) {
        setIsAnalyzing(false);
        console.error(error);
      }
    }
  };

  return (
    <View style={styles.container}>
      {mode === 'MAP' ? <MapView style={styles.fullScreen} /> : <CameraView style={styles.fullScreen} ref={cameraRef} />}

      {/* ★ キャラクター演出（画像版） */}
      {isAnalyzing && (
        <View style={styles.characterOverlay}>
          {/* 画像を表示 */}
          <Image source={ShugoJu} style={styles.characterImage} />
          
          <View style={styles.speechBubble}>
            <Text style={styles.speechBubbleText}>鑑定中だモン！</Text>
            <Text style={styles.speechBubbleText}>ちょっと待ってね！</Text>
            <ActivityIndicator color="#66cdaa" style={{marginTop: 8}} />
          </View>
        </View>
      )}

      <View style={styles.overlay}>
        <TouchableOpacity style={styles.mainButton} onPress={handlePress}>
          <Text style={styles.buttonText}>{mode === 'MAP' ? "ゴミを探す" : "AIで鑑定"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  fullScreen: { flex: 1 },
  overlay: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  mainButton: { backgroundColor: '#2ecc71', paddingVertical: 15, paddingHorizontal: 30, borderRadius: 50 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  
  // ★ 画像用のスタイル
  characterOverlay: {
    position: 'absolute', top: '15%', alignSelf: 'center', alignItems: 'center', zIndex: 100
  },
  characterImage: {
    width: 150, // 画像の幅
    height: 150, // 画像の高さ
    resizeMode: 'contain', // 画像の比率を維持
    marginBottom: -10, // 吹き出しに近づける
  },
  speechBubble: {
    backgroundColor: '#fff', padding: 20, borderRadius: 25, borderWidth: 3, borderColor: '#66cdaa', alignItems: 'center'
  },
  speechBubbleText: { fontSize: 18, fontWeight: 'bold', color: '#333' }
});