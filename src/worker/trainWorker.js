import * as Turf from '@turf/turf';

const accDistance = 0.4;
const sampleUnitSec = 1;
const options = {units: 'kilometers'};

function getTodayWithTime (timeString) {
    // ex time "08:10:05"
    const today = new Date();
    const [hours, minutes, seconds] = timeString.split(':').map(Number);
    const dateWithTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), hours, minutes, seconds);
    return dateWithTime;
}

function plus9hours (jsDate) {
    jsDate.setHours(jsDate.getHours() + 9);
}

function getDistance (start, end) {
    start = Turf.getCoord(start);
    end = Turf.getCoord(end)
    const from = Turf.point(start);
    const to = Turf.point(end);
    return Math.round(Turf.distance(from, to, {units: 'kilometers'}) * 1000) / 1000
}

function getVelocity (accDistance, noAccDistance, elapsedSec) {
    const accSec = (2 * accDistance * elapsedSec) / (noAccDistance + 2 * accDistance)
    const noAccSec = elapsedSec - accSec;

    const velocity = (noAccDistance / noAccSec) * 3600 // km/h
    return velocity;
}

function getDuration (distance, velocity) {
    return distance / velocity; //h
}

function makeTimeSample (numberOfSamples, startDatetime, totalSeconds) {
    let timeList = [];
    const startTime = startDatetime.getTime();

    for (let i = 0; i < numberOfSamples; i++) {
        const factor = i / numberOfSamples;
        const time = new Date(startTime + factor * totalSeconds * 1000);
        timeList.push(time);
    }

    return timeList;
};

function makeTrainEntity (line, train, railways) {

    const timetable = train.timetables;

    const positions = [];
    const stations = [];
    const angles = [];

    let noRailway = false;
    //2. 시간과 속도, 가속도 계산
    timetable.forEach((node, index, array) => {

        const startNode = node;
        const endNode = array[index+1];
        if(!endNode) return;

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
            stations.push ({
                startDatetime: arrive, endDatetime: depart,
                info: `현재역: ${startNode.name}`
            })
        }
        stations.push ({
            startDatetime, endDatetime,
            info: `전역: ${startNode.name}, 다음역: ${endNode.name}`
        })

        // 계산 시작
        const diff = endDatetime.getTime() - startDatetime.getTime();
        const totalElapsedSec = Math.floor(diff / 1000);

        // console.log(line, startNode, endNode)
        // console.log(railwayCoords)
        // console.log(railwayCoords.length)

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

        // - 1 구간 구하기
        let locationList = [];
        const distanceList = [];
        let distance = 0;
        let lengthValue = Turf.length(accUpFeature);
        let i = 0;
        while(distance < lengthValue) {
            const sec = i++ * sampleUnitSec;
            distance = (1 / 2) * accVelocity * (((sec) * (sec)) / 3600); //km
            distanceList.push(distance);
            locationList.push(Turf.getCoord(Turf.along(feature, distance)));
        }

        // - 2 구간 구하기
        lengthValue = lengthValue + Turf.length(noAccFeature);
        const gap = distanceList[distanceList.length - 1] - distanceList[distanceList.length - 2];
        while(distance < lengthValue) {
            distance = distance + gap;
            locationList.push(Turf.getCoord(Turf.along(feature, distance)));
        }

        // - 3 구간 구하기
        distanceList.reverse();
        lengthValue = Turf.length(feature);
        i = 0;
        while(distance < lengthValue) {
            const gap = (distanceList[i++] - distanceList[i])
            distance = distance + gap;
            locationList.push(distance ? Turf.getCoord(Turf.along(feature, distance)): Turf.getCoords(feature).reverse()[0]);
        }

        // - timesample
        const timeSampleList = makeTimeSample(locationList.length, startDatetime, totalElapsedSec);

        let j = 0;
        for(let time of timeSampleList) {
            if( j !== 0) {
                const location = locationList[j];
                positions.push({
                    time,
                    location
                })
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

            const angle = Turf.bearing(Turf.point(location), Turf.point(nextLocation));
            angles.push({
                startDatetime: time,
                endDatetime: nextTime,
                angle
            })
            lastBearing = angle;

        }

        if(array[index+2]) {
            const endNodeDepartDatetime = getTodayWithTime(array[index+1].depart);
            plus9hours(endNodeDepartDatetime);

            angles.push({
                startTime: endDatetime,
                endTime: endNodeDepartDatetime,
                lastBearing
            })
        }
    })

    return {
        trainNo: train.trainNo,
        positions,
        stations,
        angles,
    }

}

onmessage = function (event) {
    console.log("worker onmessage", new Date())
    const { line, trains, railways } = event.data;
    if(!trains) return;

    const entities = [];

    for(let train of trains) {
        if(railways && line) {
            const entity = makeTrainEntity(line, train, railways);
            if(entity) entities.push(entity)
        }
    }
    console.log("worker end", new Date())


    // 결과물을 메인 스레드로 보냄
    postMessage(entities); //TODO
};
