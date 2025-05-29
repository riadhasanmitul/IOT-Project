import { StyleSheet, Text, View, TouchableOpacity, Modal, Alert, Animated, Dimensions, ScrollView } from 'react-native';
import React, { useState, useEffect, useRef } from 'react';
import db from '../config';
import { ref, onValue } from 'firebase/database';

const { width, height } = Dimensions.get('window');

const FetchData = () => {
  const [sensorData, setSensorData] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [alertInfo, setAlertInfo] = useState({
    level: 'normal',
    message: '',
    color: '#4CAF50'
  });

  // Animation values
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0)).current;

  const thresholds = {
  temperature: { warning: 28, danger: 25 },
  humidity: { warning: 80, danger: 90 },
  distance_cm: { warning: 5, danger: 3 },
  flow_rate_lpm: { warning: 5, danger: 20 }
};

  // Start animations
  useEffect(() => {
    // Pulse animation for alert
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.03,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    // Slide in animation
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Scale animation for cards
    Animated.stagger(200, [
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      })
    ]).start();

    if (alertInfo.level !== 'normal') {
      pulseAnimation.start();
    } else {
      pulseAnimation.stop();
    }

    return () => {
      pulseAnimation.stop();
    };
  }, [alertInfo.level]);

  // Evaluate sensor data and determine alert level
  const evaluateAlertLevel = (data) => {
    if (!data) return { level: 'normal', message: 'No data available', color: '#4CAF50' };

    const allDanger = 
      data.temperature >= thresholds.temperature.danger &&
      data.humidity >= thresholds.humidity.danger &&
      data.distance_cm <= thresholds.distance_cm.danger &&
      data.flow_rate_lpm >= thresholds.flow_rate_lpm.danger;

    if (allDanger) {
      return {
        level: 'critical',
        message: 'CRITICAL ALERT: All parameters indicate severe flood risk!',
        color: '#F44336'
      };
    }

    const waterDanger = 
      data.distance_cm <= thresholds.distance_cm.danger &&
      data.flow_rate_lpm >= thresholds.flow_rate_lpm.danger;

    if (waterDanger) {
      return {
        level: 'warning',
        message: 'WARNING: Water levels and flow rate indicate high flood risk!',
        color: '#FF9800'
      };
    }

    const envWarning = 
      data.temperature >= thresholds.temperature.warning &&
      data.humidity >= thresholds.humidity.warning;

    if (envWarning) {
      return {
        level: 'caution',
        message: 'CAUTION: Environmental conditions may lead to flooding!',
        color: '#FF9800'
      };
    }

    return { level: 'normal', message: 'All parameters normal', color: '#4CAF50' };
  };

  useEffect(() => {
    const sensorRef = ref(db, '/sensors');
    onValue(sensorRef, (snapshot) => {
      const data = snapshot.val();
      console.log('Fetched Data:', data);
      setSensorData(data);
      
      const alertStatus = evaluateAlertLevel(data);
      setAlertInfo(alertStatus);
      
      if (alertStatus.level !== 'normal') {
        Alert.alert('Flood Alert', alertStatus.message, [
          {
            text: 'View Details',
            onPress: () => setModalVisible(true)
          },
          {
            text: 'Dismiss',
            style: 'cancel'
          }
        ]);
      }
    });
  }, []);

  const getStatusColor = (value, type) => {
    if (type === 'distance_cm') {
      if (value <= thresholds[type].danger) return '#F44336';
      if (value <= thresholds[type].warning) return '#FF9800';
    } else {
      if (value >= thresholds[type].danger) return '#F44336';
      if (value >= thresholds[type].warning) return '#FF9800';
    }
    return '#4CAF50';
  };

  const getStatusEmoji = (level) => {
    switch(level) {
      case 'critical': return '🚨';
      case 'warning': return '⚠️';
      case 'caution': return '⚠️';
      default: return '✅';
    }
  };

  const getSensorEmoji = (type) => {
    switch(type) {
      case 'temperature': return '🌡️';
      case 'humidity': return '💧';
      case 'distance_cm': return '📏';
      case 'flow_rate_lpm': return '🌊';
      default: return '📊';
    }
  };

  const renderSensorCard = (title, value, unit, type, emoji) => {
    const statusColor = getStatusColor(value, type);
    
    return (
      <Animated.View 
        style={[
          styles.sensorCard,
          { 
            transform: [{ scale: scaleAnim }],
            borderLeftColor: statusColor,
            shadowColor: statusColor,
          }
        ]}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.emoji}>{emoji}</Text>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        </View>
        
        <Text style={styles.sensorTitle}>{title}</Text>
        
        <View style={styles.valueContainer}>
          <Text style={[styles.sensorValue, { color: statusColor }]}>
            {typeof value === 'number' ? value.toFixed(1) : value}
          </Text>
          <Text style={styles.sensorUnit}>{unit}</Text>
        </View>
        
        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBg}>
            <Animated.View 
              style={[
                styles.progressBar,
                { 
                  backgroundColor: statusColor,
                  width: type === 'humidity' ? `${Math.min(value, 100)}%` : 
                         type === 'temperature' ? `${Math.min((value / 50) * 100, 100)}%` :
                         type === 'distance_cm' ? `${Math.max(0, 100 - (value / 30) * 100)}%` :
                         `${Math.min((value / 25) * 100, 100)}%`
                }
              ]}
            />
          </View>
        </View>
      </Animated.View>
    );
  };

  const renderAlertBanner = () => {
    if (alertInfo.level === 'normal') return null;

    return (
      <Animated.View 
        style={[
          styles.alertBanner,
          { 
            backgroundColor: `${alertInfo.color}20`,
            borderColor: alertInfo.color,
            transform: [{ scale: pulseAnim }]
          }
        ]}
      >
        <TouchableOpacity 
          style={styles.alertContent}
          onPress={() => setModalVisible(true)}
        >
          <Text style={styles.alertEmoji}>{getStatusEmoji(alertInfo.level)}</Text>
          <View style={styles.alertTextContainer}>
            <Text style={[styles.alertTitle, { color: alertInfo.color }]}>
              {alertInfo.level.toUpperCase()} ALERT
            </Text>
            <Text style={styles.alertMessage}>{alertInfo.message}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        <Animated.View 
          style={[
            styles.headerContainer,
            { transform: [{ translateY: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [-50, 0]
            })}] }
          ]}
        >
          <Text style={styles.headerEmoji}>🌊</Text>
          <Text style={styles.header}>Flood Detection</Text>
          <Text style={styles.subHeader}>Real-time Environmental Monitoring</Text>
        </Animated.View>

        {renderAlertBanner()}

        {/* Status Overview */}
        <Animated.View 
          style={[
            styles.statusOverview,
            { transform: [{ scale: scaleAnim }] }
          ]}
        >
          <View style={styles.statusHeader}>
            <Text style={styles.statusEmoji}>{getStatusEmoji(alertInfo.level)}</Text>
            <Text style={[styles.statusText, { color: alertInfo.color }]}>
              System Status: {alertInfo.level.toUpperCase()}
            </Text>
          </View>
          
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>4</Text>
              <Text style={styles.statLabel}>Active Sensors</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#4CAF50' }]}>98%</Text>
              <Text style={styles.statLabel}>System Health</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#2196F3' }]}>24/7</Text>
              <Text style={styles.statLabel}>Monitoring</Text>
            </View>
          </View>
        </Animated.View>
        
        {sensorData ? (
          <Animated.View 
            style={[
              styles.sensorsContainer,
              { transform: [{ translateY: slideAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [100, 0]
              })}] }
            ]}
          >
            {renderSensorCard('Temperature', sensorData.temperature, '°C', 'temperature', '🌡️')}
            {renderSensorCard('Humidity', sensorData.humidity, '%', 'humidity', '💧')}
            {renderSensorCard('Water Level', sensorData.distance_cm, 'cm', 'distance_cm', '📏')}
            {renderSensorCard('Flow Rate', sensorData.flow_rate_lpm, 'L/min', 'flow_rate_lpm', '🌊')}
          </Animated.View>
        ) : (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingEmoji}>⏳</Text>
            <Text style={styles.loadingText}>Loading sensor data...</Text>
          </View>
        )}
      </ScrollView>

      {/* Enhanced Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { borderColor: alertInfo.color }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalEmoji}>{getStatusEmoji(alertInfo.level)}</Text>
              <Text style={[styles.modalTitle, { color: alertInfo.color }]}>
                {alertInfo.level.toUpperCase()} ALERT
              </Text>
            </View>
            
            <Text style={styles.modalMessage}>{alertInfo.message}</Text>
            
            {sensorData && (
              <View style={styles.modalDetailsContainer}>
                <Text style={styles.modalDetailsTitle}>Sensor Readings:</Text>
                
                {[
                  { name: 'Temperature', value: sensorData.temperature, unit: '°C', type: 'temperature', emoji: '🌡️' },
                  { name: 'Humidity', value: sensorData.humidity, unit: '%', type: 'humidity', emoji: '💧' },
                  { name: 'Water Level', value: sensorData.distance_cm, unit: 'cm', type: 'distance_cm', emoji: '📏' },
                  { name: 'Flow Rate', value: sensorData.flow_rate_lpm, unit: 'L/min', type: 'flow_rate_lpm', emoji: '🌊' }
                ].map((sensor, index) => (
                  <View key={index} style={styles.modalSensorRow}>
                    <Text style={styles.modalSensorEmoji}>{sensor.emoji}</Text>
                    <Text style={styles.modalSensorName}>{sensor.name}:</Text>
                    <Text style={[
                      styles.modalSensorValue,
                      { color: getStatusColor(sensor.value, sensor.type) }
                    ]}>
                      {sensor.value.toFixed(1)} {sensor.unit}
                    </Text>
                  </View>
                ))}
              </View>
            )}
            
            <TouchableOpacity
              style={[styles.modalButton, { backgroundColor: alertInfo.color }]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.modalButtonText}>Close Alert Details</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default FetchData;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D1B2A',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  headerContainer: {
    alignItems: 'center',
    marginBottom: 20,
  },
  headerEmoji: {
    fontSize: 60,
    marginBottom: 10,
  },
  header: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 10,
  },
  subHeader: {
    fontSize: 16,
    color: '#7DD3FC',
    textAlign: 'center',
  },
  alertBanner: {
    marginBottom: 20,
    borderRadius: 20,
    borderWidth: 3,
    overflow: 'hidden',
  },
  alertContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  alertEmoji: {
    fontSize: 40,
    marginRight: 15,
  },
  alertTextContainer: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  alertMessage: {
    fontSize: 16,
    color: '#FFFFFF',
  },
  statusOverview: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  statusEmoji: {
    fontSize: 22,
    marginRight: 10,
  },
  statusText: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 12,
    color: '#7DD3FC',
    marginTop: 5,
  },
  sensorsContainer: {
    marginBottom: 20,
  },
  sensorCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 15,
    borderLeftWidth: 6,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  emoji: {
    fontSize: 20,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 6,
  },
  sensorTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  valueContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 15,
  },
  sensorValue: {
    fontSize: 32,
    fontWeight: 'bold',
    marginRight: 8,
  },
  sensorUnit: {
    fontSize: 18,
    color: '#7DD3FC',
  },
  progressContainer: {
    marginTop: 10,
  },
  progressBg: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 3,
  },
  loadingContainer: {
    paddingVertical: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingEmoji: {
    fontSize: 60,
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 20,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    padding: 30,
    width: '100%',
    maxWidth: 400,
    borderWidth: 4,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalEmoji: {
    fontSize: 50,
    marginBottom: 10,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  modalMessage: {
    fontSize: 18,
    textAlign: 'center',
    color: '#333333',
    marginBottom: 25,
    lineHeight: 24,
  },
  modalDetailsContainer: {
    marginBottom: 25,
  },
  modalDetailsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333333',
    marginBottom: 15,
  },
  modalSensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    marginBottom: 8,
  },
  modalSensorEmoji: {
    fontSize: 24,
    marginRight: 12,
  },
  modalSensorName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  modalSensorValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalButton: {
    paddingVertical: 18,
    borderRadius: 15,
    alignItems: 'center',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
});