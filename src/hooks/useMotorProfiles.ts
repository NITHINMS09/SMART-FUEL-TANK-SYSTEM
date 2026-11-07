import { useState, useEffect, useCallback } from 'react';
import { serialService, SerialEvent } from '../services/serialService';
import { StorageService } from '../services/storageService';
import { formatProfileCommand, sortMotorProfiles, MAX_MOTOR_PROFILES } from '../services/motorService';
import { MotorDirection, MotorProfile } from '../types';

export function useMotorProfiles() {
  const [profiles, setProfiles] = useState<MotorProfile[]>(() => {
    return StorageService.loadMotorProfiles();
  });
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [pendingProfileId, setPendingProfileId] = useState<string | null>(null);
  const [profileMessage, setProfileMessage] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Sync with browser storage
  useEffect(() => {
    StorageService.saveMotorProfiles(profiles);
  }, [profiles]);

  // Subscribe to ESP32 responses
  useEffect(() => {
    const unsubscribe = serialService.subscribe((event: SerialEvent) => {
      if (event.type === 'PROFILE_SAVED') {
        setIsSaving(false);
        setProfiles((prev) =>
          prev.map((p) => {
            if (p.id === pendingProfileId) {
              return { ...p, syncedToESP: true };
            }
            return p;
          })
        );
        setPendingProfileId(null);
        setProfileMessage('Motor profile confirmed and stored in ESP32 NVS.');
      } else if (event.type === 'PROFILE_POINT') {
        // Received during GET_DATA synchronization
        setProfiles((prev) => {
          const exists = prev.some((p) => p.volumeMl === event.ml);
          if (exists) return prev;
          const item: MotorProfile = {
            id: Math.random().toString(36).substring(2, 9),
            volumeMl: event.ml,
            openDegrees: event.openDeg,
            openDirection: event.openCW,
            closeDegrees: event.closeDeg,
            closeDirection: event.closeCW,
            syncedToESP: true,
            timestamp: Date.now(),
          };
          return sortMotorProfiles([...prev, item]);
        });
      } else if (event.type === 'ERROR') {
        setIsSaving(false);
        setPendingProfileId(null);
      }
    });

    return unsubscribe;
  }, [pendingProfileId]);

  /**
   * Save a profile to state and send command to ESP32
   */
  const saveProfile = useCallback(
    async (profileData: Omit<MotorProfile, 'id' | 'syncedToESP' | 'timestamp'>, existingId?: string) => {
      setProfileError(null);
      setProfileMessage(null);

      if (profileData.volumeMl < 0 || isNaN(profileData.volumeMl)) {
        setProfileError('Volume must be a valid positive number in ml.');
        return false;
      }

      if (!existingId && profiles.length >= MAX_MOTOR_PROFILES) {
        setProfileError(`Cannot exceed maximum of ${MAX_MOTOR_PROFILES} motor profiles.`);
        return false;
      }

      const id = existingId || Math.random().toString(36).substring(2, 9);
      const newProfile: MotorProfile = {
        ...profileData,
        id,
        syncedToESP: false,
        timestamp: Date.now(),
      };

      // Update state locally first
      setProfiles((prev) => {
        const filtered = prev.filter((p) => p.id !== id);
        return sortMotorProfiles([...filtered, newProfile]);
      });

      // Send PROFILE command to ESP32
      setIsSaving(true);
      setPendingProfileId(id);

      try {
        const cmd = formatProfileCommand(newProfile);
        await serialService.sendCommand(cmd);
        return true;
      } catch (err: any) {
        setIsSaving(false);
        setPendingProfileId(null);
        setProfileError(`Failed to send PROFILE command to ESP32: ${err.message}`);
        return false;
      }
    },
    [profiles]
  );

  /**
   * Delete a motor profile
   */
  const deleteProfile = useCallback(async (id: string) => {
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /**
   * Replace all profiles (e.g. from JSON backup import or full ESP32 sync)
   */
  const replaceAllProfiles = useCallback((newProfiles: MotorProfile[]) => {
    setProfiles(sortMotorProfiles(newProfiles));
  }, []);

  /**
   * Test specific rotation for a profile
   */
  const testRotation = useCallback(
    async (type: 'OPEN' | 'CLOSE', degrees: number, direction: MotorDirection) => {
      if (serialService.isMotorRunning()) {
        throw new Error('Motor is currently running another task.');
      }
      const cmd = `${type},${Math.round(degrees)},${direction}`;
      await serialService.sendCommand(cmd);
    },
    []
  );

  return {
    profiles,
    isSaving,
    profileMessage,
    profileError,
    saveProfile,
    deleteProfile,
    replaceAllProfiles,
    testRotation,
    setProfileError,
  };
}
