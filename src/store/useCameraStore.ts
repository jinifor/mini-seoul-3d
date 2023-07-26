import { create } from 'zustand'

import * as Cesium from 'cesium'

import mapConfig from '../map/config';

interface useCameraStoreInterface {
    available: boolean,
    setAvailable: (available: boolean) => void,
    cameraEntity: Cesium.Entity | null,
    setCameraEntity: (entity: Cesium.Entity) => void,
    removeCameraEntity: () => void,
    bearing: number | null,
    setBearing: (bearing: number) => void,
    removeBearing: () => void,
    mode: string,
    setMode: (mode: string) => void,
}

const useCameraStore = create<useCameraStoreInterface>((set) => ({
    available: false,
    setAvailable: (available) => {
        set((state) => ({
            available
        }))
    },
    cameraEntity: null,
    setCameraEntity: (cameraEntity) => {
        set((state) => ({
            cameraEntity
        }))
    },
    removeCameraEntity: () => {
        set((state) => ({
            cameraEntity: null
        }))
    },
    bearing: null,
    setBearing: (bearing) => {
        set((state) => ({
            bearing
        }))
    },
    removeBearing: () => {
        set((state) => ({
            bearing: null
        }))
    },
    mode: mapConfig.CAMERA_MODE.TRACK,
    setMode: (mode) => {
        set((state) => ({
            mode
        }))
    }
}))

export default useCameraStore
