import * as Cesium from 'cesium';
// @ts-ignore
import {Viewer} from '@types/cesium';
import config from './config';

import { getTodayWithTime, plus9hours, getJulianDate } from "../utils/datetime";
import {ScreenSpaceEventHandler} from "cesium";
import {CameraOption} from "./types";

let viewer: Viewer | null = null;

let pickedEntity: Cesium.Entity | null = null;

const DATASOURCE_NAME = {
    TRAIN: 'train',
}

const setCameraView = (params: CameraOption) => {
    viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
            params.longitude,
            params.latitude,
            params.altitude
        ),
        orientation: {
            heading: Cesium.Math.toRadians(params.heading),
            pitch: Cesium.Math.toRadians(params.pitch),
            roll: params.roll
        },
    });
};

const setKorDateTime = (timeStr: string | void) => {
    // ex time "08:10:05"
    const today = timeStr? getTodayWithTime(timeStr) : new Date();
    plus9hours(today);
    viewer.clock.currentTime = getJulianDate(today);
}

const getSizeByZoom = () => {
    const zoomLevel = viewer.camera.positionCartographic.height;
    let size = zoomLevel/100;
    size = size > config.TRAIN_SIZE.max ? config.TRAIN_SIZE.max :
            size < config.TRAIN_SIZE.min ? config.TRAIN_SIZE.min : size;
    return size
}

const zoom = (flag) => {
    const camera = viewer.camera;
    const currentHeight = camera.positionCartographic.height;
    if (flag) {
        if (currentHeight < 0) return;
        camera.zoomIn(currentHeight * 0.3);
    } else {
        camera.zoomOut(currentHeight * 0.3);
    }
}

const findDataSourceByName = (name) => {
    let dataSource = viewer.dataSources.getByName(name);
    if (dataSource.length === 0) {
        dataSource = new Cesium.CustomDataSource();
        dataSource.name = name;
        viewer.dataSources.add(dataSource);
    } else {
        dataSource = dataSource[0];
    }
    return dataSource;
}

const getEntityBearing = (entity) => {
    const now = Cesium.JulianDate.toDate(viewer.clock.currentTime);
    if(!entity.bearing) return;

    let bearing = entity.bearing.getValue(now);

    if(!bearing) return null;
    bearing = bearing;

    return bearing;
}

const trackEntity = (entity, bearing, cameraMode) => {
    if(viewer.trackedEntity) {
        viewer.trackedEntity = undefined;
    }

    bearing = config.MODE_VALUE[cameraMode].bearing(bearing);

   const distance = config.MODE_VALUE[cameraMode].distance;
   const heading = Cesium.Math.toRadians(bearing);
   const pitch = config.MODE_VALUE[cameraMode].pitch;
   const roll = 0;  // 회전 없음

   const quaternion = Cesium.Transforms.headingPitchRollQuaternion(
       new Cesium.Cartesian3(0, 0, 0),
       new Cesium.HeadingPitchRoll(heading, pitch, roll)
   );

   const direction = new Cesium.Cartesian3(0, 0, 3);  // 북쪽 방향

   const position = Cesium.Matrix3.multiplyByVector(
       Cesium.Matrix3.fromQuaternion(quaternion),
       direction,
       new Cesium.Cartesian3()
   );

   if(distance) entity.viewFrom =  Cesium.Cartesian3.multiplyByScalar(position, distance, position);

    viewer.trackedEntity = entity;
}


const animateCamera = (entity, fromBearing, toBearing, cameraMode) => {
    let currentStep = 0;
    const steps = 20;

    let bearingDiff = toBearing - fromBearing;
    const bearingStep = bearingDiff / steps;

    const stepDuration = 0.01; // 각 단계의 지속 시간 (초)

    function animate() {
        if (currentStep < steps) {
            fromBearing += bearingStep;
            bearingDiff = toBearing - fromBearing;
            currentStep++;
            trackEntity(entity, fromBearing, cameraMode);
            setTimeout(animate, stepDuration*1000);
        }
    }
    animate();
}

const moveCamera = (entity, fromBearing, cameraMode, callback) => {
    if(cameraMode == config.CAMERA_MODE.TRACK) {
        trackEntity(entity, fromBearing, cameraMode);
    }else {
        const bearing = getEntityBearing(entity);
        if(!bearing) return;
        if(fromBearing == bearing) return;

        if(viewer.trackedEntity) {
            viewer.trackedEntity = undefined;
        }
        callback(bearing);
        animateCamera(entity, fromBearing, bearing, cameraMode);
    }
}


let entityHoverHandler: ScreenSpaceEventHandler | void | null = null;
let entityClickHandler: ScreenSpaceEventHandler | void | null = null;

const setTrainHoverHandler = (set: boolean, callback: (entity: Cesium.Entity | null) => void) => {
    if(set) {
        if(!entityHoverHandler) {
            let pickedObject;
            const trainDataSource = findDataSourceByName(DATASOURCE_NAME.TRAIN);
            entityHoverHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            entityHoverHandler.setInputAction(function (movement) {
                if(pickedObject?.id) {
                    callback(null)
                }
                pickedObject = viewer.scene.drillPick(movement.endPosition)[0];
                if(Cesium.defined(pickedObject) && pickedObject.id && !(trainDataSource.entities.values.indexOf(pickedObject.id) < 0)) {
                    pickedEntity = pickedObject.id as Cesium.Entity;
                    callback(pickedEntity);
                }

            }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
        }
    }else {
        entityHoverHandler = entityHoverHandler && entityHoverHandler.destroy();
    }
}

const setTrainClickHandler = (set: boolean, cameraMode: string, callback: (entity: Cesium.Entity | null, bearing: number | null) => void) => {
    if(set) {
        if(!entityClickHandler) {
            entityClickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
            entityClickHandler.setInputAction(function (movement) {
                const trainDataSource = findDataSourceByName(DATASOURCE_NAME.TRAIN); //TODO
                const pickedObject = viewer.scene.pick(movement.position);
                if(Cesium.defined(pickedObject) && pickedObject.id) {
                    const pickedEntity = pickedObject.id;
                    viewer.clock.shouldAnimate = true;
                    const bearing = cameraMode == config.CAMERA_MODE.TRACK ? 180 : getEntityBearing(pickedEntity);
                    trackEntity(pickedEntity, bearing, cameraMode);
                    callback(pickedEntity, bearing);
                }else {
                    viewer.trackedEntity = undefined;
                    setCameraView(config.DEFAULT_CAMERA_OPTION);
                    callback(null, null);
                }
            }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
        }
    }else {
        entityClickHandler = entityClickHandler && entityClickHandler.destroy();
    }
}

export default {
    viewer,
    getCurrentTime: () : Cesium.JulianDate => viewer.clock.currentTime,
    DATASOURCE_NAME,
    getViewer: (): Viewer | null => viewer,
    setCameraView,
    getSizeByZoom,
    zoom,
    findDataSourceByName,
    trackEntity,
    moveCamera,
    setTrainHoverHandler,
    setTrainClickHandler,
    initMap: async (mapId: string) => {
        Cesium.Ion.defaultAccessToken = config.ACCESS_TOKEN;

        viewer = new Cesium.Viewer(mapId, {
            // imageryProvider: new Cesium.UrlTemplateImageryProvider({
            //     url: `${config.MAP_TILER.url}/maps/dataviz/{z}/{x}/{y}.png?key=${config.MAP_TILER.key}`,
            //     minimumLevel: 0,
            //     maximumLevel: 20
            // }),
            // imageryProvider: new Cesium.OpenStreetMapImageryProvider({
            //     url : 'https://a.tile.openstreetmap.org/'
            // }),
            imageryProvider: Cesium.createWorldImagery({
                style: Cesium.IonWorldImageryStyle.ROAD,
            }),
            shouldAnimate: true,
            animation: true,
            fullscreenButton: false,
            timeline: true,
            geocoder: false, // toolbar
            homeButton: false, // toolbar
            baseLayerPicker: false, // toolbar
            sceneModePicker: false, // toolbar
            infoBox: false,
            selectionIndicator: false,
            navigationHelpButton: false, // toolbar,
            // terrain
            // terrainProvider: new Cesium.CesiumTerrainProvider({
            //     url: "https://175.197.92.213:10210/terrain-tile/dem05_ellipsoid"
            // }),
            // 영상
            showRenderLoopErrors: false,
        });

        // viewer.scene.primitives.add(
        //     new Cesium.Cesium3DTileset({
        //         // @ts-ignore
        //         url: `http://175.197.92.213:10210/ngii-buildings/3DTiles_20230613/su/tileset.json`,
        //         customShader: new Cesium.CustomShader({
        //             lightingModel: Cesium.LightingModel.UNLIT,
        //         }),
        //     })
        // );

        viewer.bottomContainer.style.visibility = 'hidden';

        viewer.camera.percentageChanged = 0.01;

        setCameraView(config.DEFAULT_CAMERA_OPTION);
        setKorDateTime();
    },

};
