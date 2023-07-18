import * as Cesium from 'cesium';
// @ts-ignore
import {Cartesian3, Entity, Viewer, JulianDate} from '@types/cesium';
import * as Turf from '@turf/turf';
import {Units} from "@turf/helpers";
import {Railway, RailwayInfo, Train, TimetablesInfo} from "../data/types";

import map from '../map'
import { plus9hours, getJulianDate, getTodayWithTime, Period } from '../utils/datetime'

import { SampledStationProperty } from '../utils/SampledStationProperty'
import {SampledBearingProperty} from "../utils/SampledBearingProperty";

const accDistance: number = 0.4;
const sampleUnitSec = 1;
const options: { units?: Units } = {units: 'kilometers'};

type DataSet = {
    line?: string,
    railways?: Railway[],
    trains?: Train[]
}

const getDistance = (start: Turf.Coord, end: Turf.Coord) => {
    start = Turf.getCoord(start);
    end = Turf.getCoord(end)
    const from = Turf.point(start);
    const to = Turf.point(end);
    return Math.round(Turf.distance(from, to, options) * 1000) / 1000
}

const getDuration = (distance: number, velocity: number) => {
    return distance / velocity; //h
}

const makeTimeSample = (numberOfSamples: number, startDatetime: JulianDate, totalSeconds: number) => {
    let timeList: JulianDate[] = []
    for (let i = 0; i < numberOfSamples; i++) {
        const factor = i / numberOfSamples;
        const time = Cesium.JulianDate.addSeconds(
            startDatetime,
            factor * totalSeconds,
            new Cesium.JulianDate()
        );

        timeList.push(time);
    }
    return timeList;
}

const getVelocity = (accDistance: number, noAccDistance: number, elapsedSec: number) => {
    const accSec = (2 * accDistance * elapsedSec) / (noAccDistance + 2 * accDistance)
    const noAccSec = elapsedSec - accSec;

    const velocity = (noAccDistance / noAccSec) * 3600 // km/h
    return velocity;
}

export default (railwaysInfo: RailwayInfo[], timetablesInfo: TimetablesInfo[]) => {
    const lines = ["line1", "line2", "line7"]

    const dataSet: DataSet[] = [];

    lines.map(line => {
        const data: DataSet = {};
        data.line = line;
        railwaysInfo.map(r => {
            if (r.line === line) data.railways = r.railways;
        })
        timetablesInfo.map(t => {
            if (t.line === line) data.trains = t.trains;
        })
        dataSet.push(data);
    })
    return dataSet;
}

export function trainsWorker(viewer: Viewer, dataSet: DataSet[]) {

    for(let data of dataSet) {
        const line = data.line;
        const trains = data.trains;
        const railways = data.railways;

        if(!trains) continue;

        for(let train of trains) {
            if(railways && line) makeTrainEntity(viewer, line, train, railways);
        }
    }
}

const makeTrainEntity = (viewer: Viewer, line: string, train: Train, railways: Railway[]) => {

    const timetable = train.timetables;

    //1. entity 만들기
    const entityPosition =  new Cesium.SampledPositionProperty();
    const entityStation = new SampledStationProperty();
    const entityBearing = new SampledBearingProperty();

    const dataSource = map.findDataSourceByName(map.DATASOURCE_NAME.TRAIN); //TODO 얘를 좀 딴데로 옮길 수 있을것같은데... 매개변수로 전달하긴 더 싫고..ㅜㅜ

    let noRailway = false;
    //2. 시간과 속도, 가속도 계산
    timetable.forEach((node, index, array) => {
        const startNode = node;
        const endNode = array[index+1];
        if(!endNode) return;

        // 노드아이디가 여러개 이기 때문에 코드가 안맞을 수 있음. (ex 구로, 병점)
        const railway = railways?.find(railway => railway.startNodeId===startNode.node && railway.endNodeId===endNode.node);

        const railwayCoords = railway?.coordinates;

        const startDatetime = getTodayWithTime(startNode.depart);
        const endDatetime = getTodayWithTime(endNode.arrive);
        plus9hours(startDatetime);
        plus9hours(endDatetime);

        if(startNode.arrive !== '00:00:00' || startNode.depart !== '00:00:00') {
            const arrive = getTodayWithTime(startNode.arrive);
            const depart = getTodayWithTime(startNode.depart)
            plus9hours(arrive);
            plus9hours(depart);
            entityStation.addSample( new Period(arrive, depart), `현재역: ${startNode.name}`);
        }

        entityStation.addSample( new Period(startDatetime, endDatetime), `전역: ${startNode.name}, 다음역: ${endNode.name}`);

        const startJulianDate = getJulianDate(startDatetime);
        const endJulianDate = getJulianDate(endDatetime);
        const totalElapsedSec = Cesium.JulianDate.secondsDifference(endJulianDate, startJulianDate);

        // @ts-ignore
        const feature = Turf.lineString(railwayCoords)
        // @ts-ignore
        const reversedLine = [...railwayCoords].reverse();
        // @ts-ignore
        const reversedFeature = Turf.lineString(reversedLine)

        // 시작지점(속도증가), 속도증가종료지점, -----[속도일정]-----, 속도감소시작지점, 종료지점
        const accUpEndPoi = Turf.getCoord(Turf.along(feature, accDistance));
        const accDownStartPoi = Turf.getCoord(Turf.along(reversedFeature, accDistance));

        // 등속도 구간의 거리
        const noAccDistance = Math.round((getDistance(accUpEndPoi, accDownStartPoi))*1000)/1000
        // 최고속도
        const velocity = getVelocity(accDistance*2, noAccDistance, totalElapsedSec); // km/h
        // 등가속도 구간괴 등속도 구간의 소요시간
        const accElapsedSec = getDuration(accDistance, velocity/2) * 60 * 60 // 평균속도 velocity/2 (0 ~ velocity)
        // 가속도
        const accVelocity = ((velocity * 1000 /3600) / accElapsedSec) / 1000 * 3600; // km/h^2

        // 3. 샘플 구하기
        const accUpFeature = Turf.lineSliceAlong(feature, 0, accDistance);
        const noAccFeature = Turf.lineSlice(Turf.point(accUpEndPoi), Turf.point(accDownStartPoi), feature);

        let locationList:number[][] = [];
        // - 1 구간 구하기
        const distanceList: number[] = [];
        let distance: number = 0;
        let length = Turf.length(accUpFeature);
        let i = 0;
        while(distance < length) {
            const sec = i++ * sampleUnitSec;
            distance = (1 / 2) * accVelocity * (((sec) * (sec)) / 3600); //km
            distanceList.push(distance);
            locationList.push(Turf.getCoord(Turf.along(feature, distance)));
        }

        // - 2 구간 구하기
        length = length + Turf.length(noAccFeature);
        const gap = distanceList[distanceList.length - 1] - distanceList[distanceList.length - 2];
        while(distance < length) {
            distance = distance + gap;
            locationList.push(Turf.getCoord(Turf.along(feature, distance)));
        }

        // - 3 구간 구하기
        distanceList.reverse();
        length = Turf.length(feature);
        i = 0;
        while(distance < length) {
            const gap = (distanceList[i++] - distanceList[i])
            distance = distance + gap;
            locationList.push(distance ? Turf.getCoord(Turf.along(feature, distance)): Turf.getCoords(feature).reverse()[0]);
        }

        // - timesample
        const timeSampleList = makeTimeSample(locationList.length, startJulianDate, totalElapsedSec);

        let j = 0;
        for(let time of timeSampleList) {
            if( j !== 0) {
                const location = locationList[j];
                // @ts-ignore
                entityPosition.addSample(time, new Cesium.Cartesian3.fromDegrees(location[0], location[1]) );
            }
            j++;
        }

        // 4. 시간에 따른 각도 계산
        let lastBearing = 0;
        for(let k=0; k<timeSampleList.length; k++) {
            //TODO 정차되어있는 시간동안의 각도가 포함되지 않았나보다...
            const time = timeSampleList[k];
            const location = locationList[k];
            const nextTime = timeSampleList[k+1];
            const nextLocation = locationList[k+1];

            if(!nextTime || !nextLocation) break;

            const bearing = Turf.bearing(Turf.point(location), Turf.point(nextLocation));
            entityBearing.addSample(
                new Period(Cesium.JulianDate.toDate(time), Cesium.JulianDate.toDate(nextTime)),
                bearing
            );
            lastBearing = bearing;

        }

        if(array[index+2]) {
            const endNodeDepartDatetime = getTodayWithTime(array[index+1].depart);
            plus9hours(endNodeDepartDatetime);

            entityBearing.addSample(
                new Period(endDatetime, endNodeDepartDatetime),
                lastBearing
            );
        }

    });

    if (noRailway) {
        console.log(`${train.trainNo}: no railway info`); return;
    }

    dataSource.entities.add({
        id: train.trainNo,
        position: entityPosition,
        orientation: new Cesium.VelocityOrientationProperty(entityPosition), // Automatically set the vehicle's orientation to the direction it's facing.
        description: {
            'station': entityStation,
            'bearing': entityBearing,
        },
        model: {
            uri: `./data/${line}.glb`,
            scale: new Cesium.CallbackProperty(map.getSizeByZoom, false),
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND
        },
    });
}
