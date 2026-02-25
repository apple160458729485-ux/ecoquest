import { GoogleGenerativeAI } from "@google/generative-ai";
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import { initializeApp } from "firebase/app";
import { getDatabase, onValue, push, ref } from "firebase/database";
import { Camera, Crosshair } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// --- 地図のWeb対応設定 ---
let MapView: any, Marker: any;
if (Platform.OS !== 'web') {
  const Maps = require('react-native-maps');
  MapView = Maps.default;
  Marker = Maps.Marker;
} else {
  // Web版では地図の代わりに空のViewを表示する代用品
  MapView = ({ children, style }: any) => (
    <View style={[style, { backgroundColor: '#e0e0e0', justifyContent: 'center', alignItems: 'center' }]}>
      <Text>マップはWeb版では準備中です（スマホアプリ版で表示されます）</Text>
    </View>
  );
  Marker = () => null;
}

// --- 設定エリア ---
// 注意：APIキーは本来VercelのEnvironment Variablesで管理するのが安全です
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [mode, setMode] = useState<'MAP' | 'CAMERA'>('MAP');
  const [markers, setMarkers] = useState<any[]>([]);
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
    const prompt = "この画像にあるゴミを特定し、'素材名'だけを1単語で答えてください（例：ペットボトル、空き缶、紙くず）";
    
    const result = await model.generateContent([
      prompt,
      { inlineData: { data: base64Photo, mimeType: "image/jpeg" } }
    ]);
    return result.response.text();
  };

  const handleCaptureAndUpload = async () => {
    if (cameraRef.current) {
      try {
        const photo = await cameraRef.current.takePictureAsync({ base64: true });
        Alert.alert("AI解析中...", "守護獣がゴミを鑑定しています...");

        const trashType = await analyzeImageWithGemini(photo.base64);
        let loc = { coords: { latitude: 35.6812, longitude: 139.7671 } }; // デフォルト（東京駅）
        
        try {
          loc = await Location.getCurrentPositionAsync({});
        } catch (e) {
          console.log("位置情報が取得できませんでした。デフォルト値を使用します。");
        }

        push(ref(db, 'markers/'), {
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          type: trashType.trim(),
          timestamp: Date.now()
        });

        Alert.alert("成功！", `AIが「${trashType}」を認識しました。世界に共有されました！`);
        setMode('MAP');
      } catch (error: any) {
        console.error(error);
        Alert.alert("エラー", error.message);
      }
    }
  };

  return (
    <View style={styles.container}>
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

      <View style={styles.overlay}>
        <TouchableOpacity 
          style={styles.mainButton} 
          onPress={mode === 'MAP' ? () => setMode('CAMERA') : handleCaptureAndUpload}
        >
          {mode === 'MAP' ? <Camera color="#fff" /> : <Crosshair color="#fff" />}
          <Text style={styles.buttonText}>{mode === 'MAP' ? "ゴミを探す" : "AIで鑑定"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  fullScreen: { flex: 1 },
  overlay: { position: 'absolute', bottom: 50, width: '100%', alignItems: 'center' },
  mainButton: { backgroundColor: '#2ecc71', flexDirection: 'row', padding: 20, borderRadius: 50, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginLeft: 10 }
});