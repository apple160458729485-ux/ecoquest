import { GoogleGenerativeAI } from "@google/generative-ai";
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { initializeApp } from "firebase/app";
import { getDatabase, onValue, push, ref } from "firebase/database";
import { Camera, Crosshair, Map as MapIcon } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- 地図のWeb対応設定 ---
let MapView: any, Marker: any;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
} else {
  // Web版の代用品
  MapView = ({ children, style }: any) => (
    <View style={[style, { backgroundColor: '#f0f0f0', justifyContent: 'center', alignItems: 'center' }]}>
      <Text style={{color: '#888', textAlign: 'center', padding: 20}}>
        【Web版】マップは準備中です。{"\n"}スマホアプリ版で地図が表示されます。
      </Text>
    </View>
  );
  Marker = () => null;
}

// --- 設定エリア ---
// 注意: 本来は Vercel の Environment Variables で管理するのが安全です
const genAI = new GoogleGenerativeAI("AIzaSyBydO6RU-hLZV_Fu690t0AJOsSjWFilcRw");
const firebaseConfig = { 
  apiKey: "AIzaSyBydO6RU-hLZV_Fu690t0AJOsSjWFilcRw",
  authDomain: "ecoquest-fb12a.firebaseapp.com",
  databaseURL: "https://ecoquest-fb12a-default-rtdb.firebaseio.com",
  projectId: "ecoquest-fb12a",
  storageBucket: "ecoquest-fb12a.firebasestorage.app",
  messagingSenderId: "930348078549",
  appId: "1:930348078549:web:cdd265b30b348a793a995c",
  measurementId: "G-Q3H1KQRZPD" 
};
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export default function EcoQuestFinal() {
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'MAP' | 'CAMERA'>('MAP');
  const [markers, setMarkers] = useState<any[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const cameraRef = useRef<any>(null);

  // Firebaseからデータを読み込む
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

  // Gemini AI 解析
  const analyzeImageWithGemini = async (base64Photo: string) => {
    const model = genAI.getGenerativeModel({ model: "models/gemini-1.5-flash" });
    const prompt = "この画像にあるゴミを特定し、'素材名'だけを1単語で日本語で答えてください（例：ペットボトル、空き缶、紙くず）";
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Photo, mimeType: "image/jpeg" } }
    ]);
    return result.response.text();
  };

  // ボタンを押した時のメイン処理
  const handlePress = async () => {
    if (mode === 'MAP') {
      // カメラの権限チェック
      if (!permission?.granted) {
        const res = await requestPermission();
        if (!res.granted) {
          Alert.alert("カメラ許可", "カメラの使用を許可してください。");
          return;
        }
      }
      setMode('CAMERA');
    } else {
      handleCaptureAndUpload();
    }
  };

  // 撮影とアップロード
  const handleCaptureAndUpload = async () => {
    if (cameraRef.current && !isAnalyzing) {
      try {
        setIsAnalyzing(true);
        const photo = await cameraRef.current.takePictureAsync({ base64: true });
        
        const trashType = await analyzeImageWithGemini(photo.base64);
        let loc = { coords: { latitude: 35.6812, longitude: 139.7671 } };
        
        try {
          loc = await Location.getCurrentPositionAsync({});
        } catch (e) {
          console.log("Location not found");
        }

        await push(ref(db, 'markers/'), {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          type: trashType.trim(),
          timestamp: Date.now()
        });

        setIsAnalyzing(false);
        Alert.alert("鑑定完了！", `守護獣が「${trashType.trim()}」を認識しました！`);
        setMode('MAP');
      } catch (error: any) {
        setIsAnalyzing(false);
        Alert.alert("エラー", "鑑定に失敗しました。");
        console.error(error);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* 画面切り替え */}
      {mode === 'MAP' ? (
        <MapView style={styles.fullScreen} showsUserLocation={true}>
          {markers.map((m: any) => (
            <Marker 
              key={m.id} 
              coordinate={{latitude: m.lat, longitude: m.lng}} 
              title={m.type}
              pinColor={m.type.includes('ペットボトル') ? 'blue' : 'green'}
            />
          ))}
        </MapView>
      ) : (
        <CameraView style={styles.fullScreen} ref={cameraRef} />
      )}

      {/* キャラクター演出（解析中） */}
      {isAnalyzing && (
        <View style={styles.characterOverlay}>
          <Text style={{fontSize: 60}}>🦖</Text>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>鑑定中だモン！ちょっと待ってね！</Text>
            <ActivityIndicator color="#2ecc71" style={{marginTop: 5}} />
          </View>
        </View>
      )}

      {/* 操作ボタン */}
      <View style={styles.overlay}>
        {mode === 'CAMERA' && (
          <TouchableOpacity 
            style={[styles.subButton, {backgroundColor: '#95a5a6', marginBottom: 10}]} 
            onPress={() => setMode('MAP')}
          >
             <MapIcon color="#fff" size={20} />
             <Text style={styles.buttonTextSmall}>戻る</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity style={styles.mainButton} onPress={handlePress}>
          {mode === 'MAP' ? <Camera color="#fff" /> : <Crosshair color="#fff" />}
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
  mainButton: { 
    backgroundColor: '#2ecc71', 
    flexDirection: 'row', 
    paddingVertical: 15, 
    paddingHorizontal: 30, 
    borderRadius: 50, 
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000', shadowOffset: {width: 0, height: 2}, shadowOpacity: 0.25, shadowRadius: 3.84
  },
  subButton: { flexDirection: 'row', padding: 10, borderRadius: 20, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 },
  buttonTextSmall: { color: '#fff', fontSize: 14, marginLeft: 5 },
  characterOverlay: {
    position: 'absolute', top: '25%', alignSelf: 'center', alignItems: 'center', width: '80%'
  },
  bubble: {
    backgroundColor: '#fff', padding: 15, borderRadius: 20, marginTop: 10,
    borderWidth: 2, borderColor: '#2ecc71', alignItems: 'center'
  },
  bubbleText: { fontSize: 16, fontWeight: 'bold', color: '#2c3e50' }
});