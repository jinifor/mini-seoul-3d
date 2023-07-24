import * as Turf from '@turf/turf';

const accDistance = 0.04;
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

    for (let index = 0; index < timetable.length - 1; index++) {

        const startNode = timetable[index];
        const endNode = timetable[index + 1];

        if (!endNode) break; //TODO 마지막 역에서 station 정보와 position 정보 angle 정보 넣을 것 인지.

        const railway = railways?.find(
            (railway) =>
                railway.startNodeId === startNode.node && railway.endNodeId === endNode.node
        );

        const railwayCoords = railway?.coordinates;

        const startDatetime = getTodayWithTime(startNode.depart);
        const endDatetime = getTodayWithTime(endNode.arrive);
        plus9hours(startDatetime);
        plus9hours(endDatetime);

        if(startNode.arrive == '00:00:00') {
            const arrive = new Date(startDatetime.getTime() - 30 * 1000);

            stations.push ({
                startDatetime: arrive, endDatetime: startDatetime,
                info: `현재역: ${startNode.name}`
            })
            positions.push ({
                location: railwayCoords[0],
                time: arrive
            })
        }else if(endNode.depart == '00:00:00') {
            const depart = new Date(endDatetime.getTime() + 30 * 1000);
            stations.push({
                startDatetime: endDatetime, endDatetime: depart,
                info: `현재역: ${endNode.name}`
            })
            positions.push({
                location: railwayCoords[railwayCoords.length - 1],
                time: depart
            })
        }else if(startNode.arrive !== '00:00:00' || startNode.depart !== '00:00:00') {
            const arrive = getTodayWithTime(startNode.arrive);
            plus9hours(arrive);
            stations.push ({
                startDatetime: arrive, endDatetime: startDatetime,
                info: `현재역: ${startNode.name}`
            })
        }

        stations.push ({
            startDatetime, endDatetime,
            info: `전역: ${startNode.name}, 다음역: ${endNode.name}`
        })

        // 계산 시작
        const diff = endDatetime.getTime() - startDatetime.getTime();
        const totalElapsedSec = diff / 1000;

        const feature = Turf.lineString(railwayCoords);
        const reversedLine = [...railwayCoords].reverse();
        const reversedFeature = Turf.lineString(reversedLine);

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
        const accElapsedSec = getDuration(accDistance, velocity/2) * 60 * 60 // 평균속도 velocity/2 (0 ~ velocity)
        // 가속도
        const accVelocity = ((velocity * 1000 /3600) / accElapsedSec) / 1000 * 3600; // km/h^2

        // - 1 구간 구하기
        let i = 1;
        let sec = sampleUnitSec;
        let distance = 0.5 * accVelocity * ((sec * sec) / 3600);

        while ( !(sec > accElapsedSec) ) {
            const time = new Date(startDatetime.getTime() + sec * 1000);
            const location = Turf.getCoord(Turf.along(accUpFeature, distance));
            positions.push({
                time,
                location,
            });

            sec = i++ * sampleUnitSec;
            distance = 0.5 * accVelocity * ((sec * sec) / 3600); //km
        }

        positions.push({
            time: new Date(startDatetime.getTime() + accElapsedSec * 1000),
            location: accUpEndPoi,
        });

        // - 2 구간 구하기
        const vertexList = Turf.getCoords(noAccFeature);
        let lastPosition = positions[positions.length - 1];

        const velocityInSec = velocity / 3600; // velocity를 초 단위로 변환

        for (let i = 0; i < vertexList.length; i++) {
            const vertex = vertexList[i];
            const distance = Turf.distance(
                Turf.point(lastPosition.location),
                Turf.point(vertex)
            );
            const sec = distance / velocityInSec;

            positions.push({
                time: new Date(lastPosition.time.getTime() + sec * 1000),
                location: vertex,
            });
        }

        // - 3 구간 구하기
        i = 0;
        sec = i++ * sampleUnitSec;
        distance = (velocity / 3600) * sec + (1/2) * (-accVelocity) * (sec * sec) / 3600; //km
        lastPosition = positions[positions.length - 1];

        while ( !(sec > accElapsedSec) ) {
            const time = new Date(lastPosition.time.getTime() + sec * 1000);
            const location = Turf.getCoord(Turf.along(accDownFeature, distance));
            positions.push({
                time,
                location,
            });

            sec = i++ * sampleUnitSec;
            distance = (velocity / 3600) * sec + (1/2) * (-accVelocity) * (sec * sec) / 3600; //km
        }

        // 4. 각도 변화  // TODO 여전히 속도가 좀 느리긴 함
        let lastAngle = 0;
        for (let p = 0; p < positions.length -1 ; p++) {
            const position = positions[p];
            const nextPosition = positions[p + 1];
            lastAngle = Turf.bearing(Turf.point(position.location), Turf.point(nextPosition.location));
            angles.push({
                startDatetime: position.time,
                endDatetime: nextPosition.time,
                lastAngle,
            });
        }

        if (timetable[index + 2]) {
            const endNodeDepartDatetime = getTodayWithTime(timetable[index + 1].depart);
            plus9hours(endNodeDepartDatetime);

            angles.push({
                startDatetime: endDatetime,
                endDatetime: endNodeDepartDatetime,
                lastAngle,
            });
        }
    }

    return {
        trainNo: train.trainNo,
        positions,
        stations,
        angles,
    };

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
