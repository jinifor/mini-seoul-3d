/*
* map config
* */
import {CameraOption} from "./types";
import * as Cesium from "cesium";

const ACCESS_TOKEN: string = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIzYTM3ODhlNC1jOWUxLTRhOTYtYTgwZC1iMDA3OGJiMTQwZDciLCJpZCI6MTI5NDU5LCJpYXQiOjE2ODIwNTc4NjN9.GC-W9QfAFa9rXMh2Ow2rSC5UvLcwtS_qjWJ1v454z1A';
const DEFAULT_CAMERA_OPTION: CameraOption = {
    longitude: 126.98465233162544,
    latitude: 37.353248730001874,
    altitude: 15000,
    heading: 0.0,
    pitch: -40.0,
    roll: 0.0
};
const MAP_TILER = {
    url: 'https://api.maptiler.com',
    key: 'XSHSlYSeKVmyAEfR1ema',
}

const CAMERA_MODE = {
    TRACK: 'track',
    TRACK_BACK: 'trackBack',
    TRACK_BACK_UPWARD: 'trackBackUpward',
    TRACK_FRONT: 'trackFront',
    TRACK_FRONT_UPWARD: 'trackFrontUpward',
}

const MODE_VALUE = {
    [CAMERA_MODE.TRACK]: {
        distance: 500,
        pitch: Cesium.Math.toRadians(-50),
        bearing: (bearing)=> 180
    },
    [CAMERA_MODE.TRACK_BACK]: {
        distance: 200,
        pitch: Cesium.Math.toRadians(-80),
        bearing: (bearing)=> bearing >= 180 ? bearing - 180 : bearing + 180
    },
    [CAMERA_MODE.TRACK_BACK_UPWARD]: {
        distance: 400,
        pitch: Cesium.Math.toRadians(-65),
        bearing: (bearing)=> bearing >= 180 ? bearing - 180 : bearing + 180
    },
    [CAMERA_MODE.TRACK_FRONT]: {
        distance: 200,
        pitch: Cesium.Math.toRadians(-80),
        bearing: (bearing)=> bearing
    },
    [CAMERA_MODE.TRACK_FRONT_UPWARD]: {
        distance: 400,
        pitch: Cesium.Math.toRadians(-65),
        bearing: (bearing)=> bearing
    }

}

const TRAIN_SIZE = {
    min: 5,
    max: 100,
}

export default {
    ACCESS_TOKEN,
    DEFAULT_CAMERA_OPTION,
    MAP_TILER,
    CAMERA_MODE,
    MODE_VALUE,
    TRAIN_SIZE
};
