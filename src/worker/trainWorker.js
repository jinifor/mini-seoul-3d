import * as Cesium from 'cesium';
import * as Turf from '@turf/turf';
import map from '../map';
import {getTodayWithTime, Period, plus9hours} from "../utils/datetime.ts";
import {SampledStationProperty} from "../utils/SampledStationProperty.ts";
import {SampledBearingProperty} from "../utils/SampledBearingProperty.ts";
import {saveJSON} from "../utils/file.js";

const accDistance = 0.4;
const sampleUnitSec = 1;
const options = {units: 'kilometers'};

const getDistance = (start, end) => {
    start = Turf.getCoord(start);
    end = Turf.getCoord(end)
    const from = Turf.point(start);
    const to = Turf.point(end);
    return Math.round(Turf.distance(from, to, options) * 1000) / 1000
}

const getDuration = (distance, velocity) => {
    return distance / velocity; //h
}

const makeTimeSample = (numberOfSamples, startDatetime, totalSeconds) => {
    let timeList = []
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

const getVelocity = (accDistance, noAccDistance, elapsedSec) => {
    const accSec = (2 * accDistance * elapsedSec) / (noAccDistance + 2 * accDistance)
    const noAccSec = elapsedSec - accSec;

    return (noAccDistance / noAccSec) * 3600 // km/h
}


function makeTrainEntity (line, train, railways) {

    const timetable = train.timetables;

    //1. entity 만들기
    const entityPosition =  new Cesium.SampledPositionProperty();
    const entityStation = new SampledStationProperty();
    const entityBearing = new SampledBearingProperty();

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

        const feature = Turf.lineString(railwayCoords)
        const reversedLine = [...railwayCoords].reverse();
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

        let locationList = [];
        // - 1 구간 구하기
        const distanceList = [];
        let distance = 0;
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
                entityPosition.addSample(time, new Cesium.Cartesian3.fromDegrees(location[0], location[1]) );
            }
            j++;
        }

        // 4. 시간에 따른 각도 계산
        let lastBearing = 0;
        for(let k=0; k<timeSampleList.length; k++) {
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

        // 정차되어있는 동안의 각도는 정차하기 전의 각도와 같도록 함.
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
        console.log(`${train.trainNo}: no railway info`); return null;
    }

    const entity = {
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
    };

    return entity;

}

onmessage = function (event) {
    console.log("워커")
    const { line, trains, railways } = event.data;

    // 작업 수행
    const datasource = map.findDataSourceByName(map.DATASOURCE_NAME.TRAIN);

    for(let train of trains) {
        if(railways && line) {
            const entity = makeTrainEntity(line, train, railways);
            if(entity) datasource.entities.add(entity);
        }
    }

    // 결과물을 메인 스레드로 보냄
    postMessage(true); //TODO
};
