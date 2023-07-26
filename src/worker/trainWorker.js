import * as Turf from '@turf/turf';

const accElapsedSec = 5;
const sampleUnitSec = 1;
const options = {units: 'kilometers'};

/**
 * @type {*[]}
 * {
 *     startNodeId:,
 *     endNodeId:,
 *     positions: [],
 *     angles: [],
 * }
 */
const mockDataSetList = [];

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

function makeTrainEntity (line, train, railways) {
    const timetable = train.timetables;
    const positions = [];
    const stations = [];
    const angles = [];

    for (let index = 0; index < timetable.length - 1; index++) {
        const startNode = timetable[index];
        const endNode = timetable[index + 1];

        if (!endNode) break;

        const railway = railways?.find(
            (railway) =>
                railway.startNodeId === startNode.node && railway.endNodeId === endNode.node
        );

        if(!railway) {
            console.log('railway not found', line,train.trainNo, startNode, endNode);
            continue
        }

        const railwayCoords = railway?.coordinates;

        const startDatetime = getTodayWithTime(startNode.depart);
        const endDatetime = getTodayWithTime(endNode.arrive);
        plus9hours(startDatetime);
        plus9hours(endDatetime);

        if (startNode.arrive === '00:00:00') {
            const arrive = new Date(startDatetime.getTime() - 30 * 1000);

            stations.push({
                startDatetime: arrive, endDatetime: startDatetime,
                info: `현재역: ${startNode.name}`
            });

            positions.push({
                location: railwayCoords[0],
                time: arrive
            });
        } else if (endNode.depart === '00:00:00') {
            const depart = new Date(endDatetime.getTime() + 30 * 1000);
            stations.push({
                startDatetime: endDatetime, endDatetime: depart,
                info: `현재역: ${endNode.name}`
            });

            positions.push({
                location: railwayCoords[railwayCoords.length - 1],
                time: depart
            });
        } else { // 00:00:00 아닌 경우
            const arrive = getTodayWithTime(startNode.arrive);
            plus9hours(arrive);
            stations.push({
                startDatetime: arrive, endDatetime: startDatetime,
                info: `현재역: ${startNode.name}`
            });
        }

        stations.push({
            startDatetime, endDatetime,
            info: `전역: ${startNode.name}, 다음역: ${endNode.name}`
        });

        // 계산 시작
        const diff = endDatetime.getTime() - startDatetime.getTime();
        const totalElapsedSec = diff / 1000;

        const feature = Turf.lineString(railwayCoords);
        const totalDistance = Turf.length(feature, options); // km

        const noAccElapsedSec = totalElapsedSec - 2 * accElapsedSec;

        //속도 구하기
        const velocity = (totalDistance * 2) / ((totalElapsedSec + noAccElapsedSec) / 3600); //km/h
        const accVelocity = velocity / (accElapsedSec / 3600); // km/h^2

        const velocityInSec = velocity / 3600; // km/s
        const accVelocityInSec = velocityInSec / accElapsedSec; // km/s^2

        const accUpEndDisplacement = ((velocityInSec * accElapsedSec) / 2);
        const accDownStartDisplacement = totalDistance - accUpEndDisplacement;

        // - 1 구간 구하기
        for (let sec = 0; sec < accElapsedSec; sec += sampleUnitSec) {
            const time = new Date(startDatetime.getTime() + sec * 1000);
            const displacement =  0.5 * accVelocityInSec * (sec * sec); ;
            const location = Turf.getCoord(Turf.along(feature, displacement, options));
            positions.push({
                time,
                location,
            });
        }

        // - 2 구간 구하기
        const noAccFeature = Turf.lineSliceAlong(feature, accUpEndDisplacement, accDownStartDisplacement, options);
        const wholeVertexList = Turf.getCoords(feature);
        const vertexList = Turf.getCoords(noAccFeature);

        let _displacement = 0;
        let takenSec = 0;
        let time = null;

        let i = 0;
        while (i < vertexList.length) {
            const vertex = vertexList[i];
            _displacement = Turf.length(Turf.lineSlice(wholeVertexList[0], vertex, feature), options);
            takenSec = (_displacement - accUpEndDisplacement) / velocityInSec + accElapsedSec;
            time = new Date(startDatetime.getTime() + takenSec * 1000);

            positions.push({
                time,
                location: vertex,
            });
            i++;
        }

        // - 3 구간 구하기
        for (let sec = accElapsedSec + noAccElapsedSec; sec < totalElapsedSec; sec += sampleUnitSec) {
            const time = new Date(startDatetime.getTime() + sec * 1000);
            const _sec = totalElapsedSec - sec;
            const displacement = totalDistance - 0.5 * accVelocityInSec * (_sec * _sec);
            const location = Turf.getCoord(Turf.along(feature, displacement, options));
            positions.push({
                time,
                location,
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

    for(let i = 0; i < trains.length; i++) {
        const train = trains[i];
        if(railways && line) {
            const entity = makeTrainEntity(line, train, railways);
            if(entity) entities.push(entity)
        }
    }

    postMessage(entities);
};


/**
 * 계산식 설명
 *
 *  @ 1구간: 등가속도, 증감
 *  @ 2구간: 등속도
 *  @ 3구간: 등가속도, 감속
 *
 * 1. 시간을 알고 변위를 구하는 경우
 *  @  1구간 (0 <= sec && sec < accElapsedSec)
 *          : 0.5 * accVelocityInSec * (sec * sec); //km
 *  @  2구간 (accElapsedSec <= sec && sec <= totalElapsedSec - accElapsedSec)
 *          : ((velocityInSec * accElapsedSec) / 2) + (velocityInSec * (sec - accElapsedSec)); //km
 *  @  3구간 (totalElapsedSec - accElapsedSec < sec && sec <= totalElapsedSec)
 *          :  [ 단, _sec = totalElapsedSec - sec]
 *              totalDistance - 0.5 * accVelocityInSec * (_sec * _sec); //km
 *{함수버전}
 * const getDisplacement = (sec) => { // return km
 *     if (0 <= sec && sec < accElapsedSec) {
 *         return 0.5 * accVelocityInSec * (sec * sec); //km
 *     } else if (accElapsedSec <= sec && sec <= totalElapsedSec - accElapsedSec) {
 *         return ((velocityInSec * accElapsedSec) / 2) + (velocityInSec * (sec - accElapsedSec));
 *     } else if (totalElapsedSec - accElapsedSec < sec && sec <= totalElapsedSec) {
 *         const _sec = totalElapsedSec - sec;
 *         return totalDistance - 0.5 * accVelocityInSec * (_sec * _sec);
 *     }
 * };
 *
 * 2. 변위를 알고 소요시간을 구하는 경우
 *  @  1구간 (0 <= sec && sec < accElapsedSec)
 *         : Math.sqrt((2 * displacement) / accVelocityInSec);
 *  @  2구간 (accElapsedSec <= sec && sec <= totalElapsedSec - accElapsedSec)
 *         : (displacement - accUpEndDisplacement) / velocityInSec + accElapsedSec;
 *  @  3구간 (totalElapsedSec - accElapsedSec < sec && sec <= totalElapsedSec)
 *         :  [ 단, _displacement = totalDistance - displacement]
 *         totalElapsedSec - Math.sqrt((2 * _displacement) / accVelocityInSec);
 *
 * {함수버전}
 * const getTakenSec = (displacement) => {
 *     if (displacement < accUpEndDisplacement) {
 *         return Math.sqrt((2 * displacement) / accVelocityInSec);
 *     } else if (accUpEndDisplacement <= displacement && displacement < accDownStartDisplacement) {
 *         return (displacement - accUpEndDisplacement) / velocityInSec + accElapsedSec;
 *     } else if (accDownStartDisplacement <= displacement && displacement <= totalDistance) {
 *         const _displacement = totalDistance - displacement;
 *         return totalElapsedSec - Math.sqrt((2 * _displacement) / accVelocityInSec);
 *     }
 * };
 *
 */


