import { useState, useEffect, useCallback } from 'react';
import { serialService, SerialEvent } from '../services/serialService';
import { ConnectionState, HX711Status, LastMotorOperation, MotorStatus, SerialMessageLog } from '../types';

export function useSerial() {
  const [connectionState, setConnectionState] = useState<ConnectionState>(serialService.getState());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [systemReady, setSystemReady] = useState<boolean>(false);
  const [hx711Status, setHx711Status] = useState<HX711Status>('OFFLINE');
  const [motorStatus, setMotorStatus] = useState<MotorStatus>('IDLE');
  const [lastOperation, setLastOperation] = useState<LastMotorOperation | null>(null);
  const [messages, setMessages] = useState<SerialMessageLog[]>(serialService.getHistory());
  const [lastVolumeReport, setLastVolumeReport] = useState<number | null>(null);

  useEffect(() => {
    const unsubscribe = serialService.subscribe((event: SerialEvent) => {
      switch (event.type) {
        case 'STATE_CHANGED':
          setConnectionState(event.state);
          if (event.state === 'CONNECTED') {
            setErrorMessage(null);
            setHx711Status('OK');
          } else if (event.state === 'DISCONNECTED') {
            setSystemReady(false);
            setHx711Status('OFFLINE');
            setMotorStatus('IDLE');
          } else if (event.state === 'ERROR') {
            setErrorMessage(event.error || 'Connection error');
            setHx711Status('ERROR');
          }
          break;

        case 'SYSTEM_READY':
          setSystemReady(true);
          setHx711Status('OK');
          break;

        case 'MOTOR_STARTED':
          setMotorStatus('RUNNING');
          break;

        case 'MOTOR_COMPLETED':
          setMotorStatus('COMPLETED');
          setTimeout(() => {
            setMotorStatus(prev => (prev === 'COMPLETED' ? 'IDLE' : prev));
          }, 3000);
          break;

        case 'ERROR':
          setMotorStatus('ERROR');
          setErrorMessage(event.message);
          break;

        case 'CURRENT_VOLUME':
        case 'AUTO_VOLUME':
          setLastVolumeReport(event.ml);
          break;

        case 'RAW_MESSAGE':
          setMessages(serialService.getHistory());
          break;
      }
    });

    return unsubscribe;
  }, []);

  const connect = useCallback(async (baudRate: number = 115200) => {
    setErrorMessage(null);
    return await serialService.connect(baudRate);
  }, []);

  const disconnect = useCallback(async () => {
    return await serialService.disconnect();
  }, []);

  const sendCommand = useCallback(async (cmd: string) => {
    return await serialService.sendCommand(cmd);
  }, []);

  const emergencyStop = useCallback(async () => {
    setLastOperation({
      type: 'EMERGENCY_STOP',
      degrees: 0,
      direction: 'NONE',
      timestamp: Date.now(),
      success: true,
      message: 'Emergency Stop command issued',
    });
    return await serialService.emergencyStop();
  }, []);

  return {
    connectionState,
    errorMessage,
    systemReady,
    hx711Status,
    motorStatus,
    lastOperation,
    setLastOperation,
    messages,
    lastVolumeReport,
    isWebSerialSupported: serialService.isWebSerialSupported(),
    connect,
    disconnect,
    sendCommand,
    emergencyStop,
  };
}
