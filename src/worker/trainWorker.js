import * as Turf from '@turf/turf';

const accDistance = 0.25;
const sampleUnitSec = 3;
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

        const feature = Turf.lineString(railwayCoords)
        const reversedLine = [...railwayCoords].reverse();
        const reversedFeature = Turf.lineString(reversedLine)

        // 시작지점(속도증가), 속도증가종료지점, -----[속도일정]-----, 속도감소시작지점, 종료지점
        const startPoi = Turf.getCoord(Turf.along(feature, 0));
        const accUpEndPoi = Turf.getCoord(Turf.along(feature, accDistance));
        const accDownStartPoi = Turf.getCoord(Turf.along(reversedFeature, accDistance));
        const endPoi = Turf.getCoord(Turf.along(reversedFeature, 0));

        const accUpFeature = Turf.lineSlice(Turf.point(startPoi), Turf.point(accUpEndPoi), feature);//Turf.lineSliceAlong(feature, 0, accDistance);
        const noAccFeature = Turf.lineSlice(Turf.point(accUpEndPoi), Turf.point(accDownStartPoi), feature);
        const accDownFeature = Turf.lineSlice(Turf.point(accDownStartPoi), Turf.point(endPoi), feature); //Turf.lineSliceAlong(reversedFeature, 0, accDistance);

        // 등속도 구간의 거리
        const noAccDistance = Turf.length(noAccFeature, options); // km
        // 최고속도
        const velocity = getVelocity(accDistance*2, noAccDistance, totalElapsedSec); // km/h
        // 등가속도 구간괴 등속도 구간의 소요시간
        const noAccElapsedSec = noAccDistance/velocity * 60 * 60; // s
        const accElapsedSec = getDuration(accDistance, velocity/2) * 60 * 60 // 평균속도 velocity/2 (0 ~ velocity)
        // 가속도
        const accVelocity = ((velocity * 1000 /3600) / accElapsedSec) / 1000 * 3600; // km/h^2

        // - 1 구간 구하기
        let i = 0;
        let sec = i++ * sampleUnitSec;
        let distance =  (1 / 2) * accVelocity * (((sec) * (sec)) / 3600);
        while(distance < accDistance) {
            positions.push({
                time: new Date(startDatetime.getTime() + sec * 1000),
                location: Turf.getCoord(Turf.along(accUpFeature, distance))
            })
            sec = i++ * sampleUnitSec;
            distance = (1 / 2) * accVelocity * (((sec) * (sec)) / 3600); //km
        }

        positions.push({
            time: new Date(startDatetime.getTime() + accElapsedSec * 1000),
            location: accUpEndPoi,
        })

        // - 2 구간 구하기
        const vertexList = Turf.getCoords(noAccFeature);
        let lastPosition = positions[positions.length - 1]

        for(let vertex of vertexList) {
            const distance = Turf.distance(Turf.point(lastPosition.location), Turf.point(vertex));
            const sec = distance / velocity * 60 * 60;

            positions.push({
                time: new Date(lastPosition.time.getTime() + sec * 1000),
                location: vertex
            })
        }

        positions.push({
            time: new Date(startDatetime.getTime()+ (accElapsedSec + noAccElapsedSec) * 1000),
            location: accDownStartPoi
        })
        // - 3 구간 구하기
        i = 0;
        sec = i++ * sampleUnitSec;
        distance =  (1 / 2) * accVelocity * (((sec) * (sec)) / 3600);
        const tmpPositions = [];
        const reversedAccDownFeature = Turf.lineSlice(Turf.point(endPoi), Turf.point(accDownStartPoi), reversedFeature);
        while(distance < accDistance) {
            tmpPositions.push({
                time: new Date(endDatetime.getTime() - sec * 1000),
                location: Turf.getCoord(Turf.along(reversedAccDownFeature, distance))
            })
            sec = i++ * sampleUnitSec;
            distance = (1 / 2) * accVelocity * (((sec) * (sec)) / 3600); //km
        }

        positions.push(...tmpPositions.reverse());

        // 4. 각도 변화 //TODO
        let lastAngle = 0;

        for(let p = 0; p<positions.length; p++) {
            const position = positions[p];
            const nextPosition = positions[p+1];
            if(!nextPosition) break;
            lastAngle = Turf.bearing(Turf.point(position.location), Turf.point(nextPosition.location));
            angles.push({
                startDatetime: position.time,
                endDatetime: nextPosition.time,
                lastAngle
            })
        }

        if(array[index+2]) {
            const endNodeDepartDatetime = getTodayWithTime(array[index+1].depart);
            plus9hours(endNodeDepartDatetime);

            angles.push({
                startDatetime: endDatetime,
                endDatetime: endNodeDepartDatetime,
                lastAngle
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
    const { line, trains, railways } = event.data;
    if(!trains) return;

    const entities = [];

    for(let train of trains) {
        if(railways && line) {
            const entity = makeTrainEntity(line, train, railways);
            if(entity) entities.push(entity)
        }
    }

    // 결과물을 메인 스레드로 보냄
    postMessage(entities); //TODO
};
