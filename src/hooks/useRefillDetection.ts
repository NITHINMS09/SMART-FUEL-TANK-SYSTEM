import { useState, useEffect, useRef, useCallback } from 'react';
import { CapState, RefillRecord, ActiveRefillSession } from '../types';
import { StorageService } from '../services/storageService';

interface UseRefillDetectionProps {
  isThisDeviceGateway: boolean;
  capState: CapState;
  currentVolumeMl: number | null;
  remoteRefillHistory?: RefillRecord[];
  remoteActiveSession?: ActiveRefillSession | null;
}

// Measurement noise threshold in ml: minimum volume increase to classify as actual fuel refill
const REFILL_NOISE_THRESHOLD_ML = 15;

export function useRefillDetection({
  isThisDeviceGateway,
  capState,
  currentVolumeMl,
  remoteRefillHistory,
  remoteActiveSession,
}: UseRefillDetectionProps) {
  // Local state initialized from storage (gateway) or remote synchronization (client)
  const [localHistory, setLocalHistory] = useState<RefillRecord[]>(() =>
    StorageService.loadRefillHistory()
  );
  const [localActiveSession, setLocalActiveSession] = useState<ActiveRefillSession | null>(() =>
    StorageService.loadActiveRefillSession()
  );

  // References to track previous state across render cycles
  const prevCapStateRef = useRef<CapState | null>(null);
  const activeSessionRef = useRef<ActiveRefillSession | null>(localActiveSession);
  activeSessionRef.current = localActiveSession;

  // -----------------------------------------------------------------
  // 1. Authoritative Gateway Refill Detection State Machine
  // -----------------------------------------------------------------
  useEffect(() => {
    // Only the authoritative gateway device connected to physical ESP32 creates records
    if (!isThisDeviceGateway) return;

    // Wait until valid volume measurement is available
    if (currentVolumeMl === null || isNaN(currentVolumeMl)) return;

    const currentCap = capState;
    const prevCap = prevCapStateRef.current;
    const currentVol = Math.round(currentVolumeMl);

    // Initial load: set previous cap state
    if (prevCap === null) {
      prevCapStateRef.current = currentCap;
      // If initialized while cap is already OPEN and no active session exists, start tracking
      if (currentCap === 'OPEN' && !activeSessionRef.current) {
        const session: ActiveRefillSession = {
          id: `refill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          openedAt: Date.now(),
          startVolumeMl: currentVol,
          currentVolumeMl: currentVol,
          maxVolumeMl: currentVol,
          minVolumeMl: currentVol,
          netVolumeChangeMl: 0,
          durationSeconds: 0,
        };
        setLocalActiveSession(session);
        StorageService.saveActiveRefillSession(session);
      }
      return;
    }

    // STATE B: Detect CLOSED → OPEN transition
    if (prevCap === 'CLOSED' && currentCap === 'OPEN') {
      console.log(`[REFILL DETECT] CLOSED → OPEN transition detected at ${currentVol} ml. Starting refill session.`);
      const newSession: ActiveRefillSession = {
        id: `refill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        openedAt: Date.now(),
        startVolumeMl: currentVol,
        currentVolumeMl: currentVol,
        maxVolumeMl: currentVol,
        minVolumeMl: currentVol,
        netVolumeChangeMl: 0,
        durationSeconds: 0,
      };
      setLocalActiveSession(newSession);
      StorageService.saveActiveRefillSession(newSession);
      prevCapStateRef.current = 'OPEN';
      return;
    }

    // STATE C: CAP REMAINS OPEN (Live continuous tracking)
    if (currentCap === 'OPEN' && activeSessionRef.current) {
      const active = activeSessionRef.current;
      const maxVol = Math.max(active.maxVolumeMl, currentVol);
      const minVol = Math.min(active.minVolumeMl, currentVol);
      const netChange = currentVol - active.startVolumeMl;
      const duration = Math.max(1, Math.round((Date.now() - active.openedAt) / 1000));

      // Only update if readings or duration changed
      if (
        currentVol !== active.currentVolumeMl ||
        maxVol !== active.maxVolumeMl ||
        minVol !== active.minVolumeMl ||
        duration !== active.durationSeconds
      ) {
        const updated: ActiveRefillSession = {
          ...active,
          currentVolumeMl: currentVol,
          maxVolumeMl: maxVol,
          minVolumeMl: minVol,
          netVolumeChangeMl: netChange,
          durationSeconds: duration,
        };
        setLocalActiveSession(updated);
        StorageService.saveActiveRefillSession(updated);
      }
      prevCapStateRef.current = 'OPEN';
      return;
    }

    // STATE D: Detect OPEN → CLOSED transition (Complete session)
    if (prevCap === 'OPEN' && currentCap === 'CLOSED') {
      const active = activeSessionRef.current;
      if (active) {
        const closedAt = Date.now();
        const endVol = currentVol;
        const finalMax = Math.max(active.maxVolumeMl, endVol);
        const finalMin = Math.min(active.minVolumeMl, endVol);
        const netChange = endVol - active.startVolumeMl;
        const durationSec = Math.max(1, Math.round((closedAt - active.openedAt) / 1000));

        // Evaluate whether volume increase exceeds measurement noise threshold
        const isRefilled = netChange >= REFILL_NOISE_THRESHOLD_ML;
        const fuelAdded = isRefilled ? netChange : 0;

        const record: RefillRecord = {
          id: active.id,
          openedAt: active.openedAt,
          closedAt,
          startVolumeMl: active.startVolumeMl,
          endVolumeMl: endVol,
          maxVolumeMl: finalMax,
          minVolumeMl: finalMin,
          netVolumeChangeMl: netChange,
          fuelAddedMl: fuelAdded,
          durationSeconds: durationSec,
          status: isRefilled ? 'FUEL REFILLED' : 'NO REFILL DETECTED',
        };

        console.log(
          `[REFILL DETECT] OPEN → CLOSED transition detected! Completed record: ${record.status} (${fuelAdded} ml added, duration: ${durationSec}s)`
        );

        setLocalHistory((prev) => {
          // Prepend newest session, avoid duplicates, limit to 100 items
          const next = [record, ...prev.filter((r) => r.id !== record.id)].slice(0, 100);
          StorageService.saveRefillHistory(next);
          return next;
        });

        // Reset active session
        setLocalActiveSession(null);
        StorageService.saveActiveRefillSession(null);
      }
      prevCapStateRef.current = 'CLOSED';
      return;
    }

    prevCapStateRef.current = currentCap;
  }, [isThisDeviceGateway, capState, currentVolumeMl]);

  // -----------------------------------------------------------------
  // 2. Ticking counter for Active Session while cap is OPEN
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!isThisDeviceGateway || capState !== 'OPEN' || !localActiveSession) return;

    const interval = setInterval(() => {
      setLocalActiveSession((prev) => {
        if (!prev) return null;
        const duration = Math.max(1, Math.round((Date.now() - prev.openedAt) / 1000));
        if (duration === prev.durationSeconds) return prev;
        const updated = { ...prev, durationSeconds: duration };
        StorageService.saveActiveRefillSession(updated);
        return updated;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isThisDeviceGateway, capState, localActiveSession]);

  // -----------------------------------------------------------------
  // 3. Remote Client Viewers: Consume Synchronized Refill History
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!isThisDeviceGateway) {
      if (remoteRefillHistory && Array.isArray(remoteRefillHistory)) {
        setLocalHistory(remoteRefillHistory);
        StorageService.saveRefillHistory(remoteRefillHistory);
      }
      if (remoteActiveSession !== undefined) {
        setLocalActiveSession(remoteActiveSession);
      }
    }
  }, [isThisDeviceGateway, remoteRefillHistory, remoteActiveSession]);

  const clearHistory = useCallback(() => {
    setLocalHistory([]);
    setLocalActiveSession(null);
    StorageService.clearRefillHistory();
  }, []);

  return {
    refillHistory: isThisDeviceGateway
      ? localHistory
      : remoteRefillHistory || localHistory,
    activeSession: isThisDeviceGateway
      ? localActiveSession
      : remoteActiveSession !== undefined
      ? remoteActiveSession
      : localActiveSession,
    clearHistory,
    isRefillActive: capState === 'OPEN',
  };
}

