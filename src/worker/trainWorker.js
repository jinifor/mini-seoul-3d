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
    let p = 0;
    const stations = [];
    let s = 0;
    const angles = [];
    let a = 0;

    for (let index = 0; index < timetable.length - 1; index++) {
        const startNode = timetable[index];
        const endNode = timetable[index + 1];

        if (!endNode) break;

        const railway = railways?.find(
            (railway) =>
                railway.startNodeId === startNode.node && railway.endNodeId === endNode.node
        );

        const railwayCoords = railway?.coordinates;

        const startDatetime = getTodayWithTime(startNode.depart);
        const endDatetime = getTodayWithTime(endNode.arrive);
        plus9hours(startDatetime);
        plus9hours(endDatetime);

        if (startNode.arrive === '00:00:00') {
            const arrive = new Date(startDatetime.getTime() - 30 * 1000);

            stations[s++] = {
                startDatetime: arrive, endDatetime: startDatetime,
                info: `현재역: ${startNode.name}`
            };

            positions[p++] = {
                location: railwayCoords[0],
                time: arrive
            };
        } else if (endNode.depart === '00:00:00') {
            const depart = new Date(endDatetime.getTime() + 30 * 1000);
            stations[s++] = {
                startDatetime: endDatetime, endDatetime: depart,
                info: `현재역: ${endNode.name}`
            };

            positions[p++] = {
                location: railwayCoords[railwayCoords.length - 1],
                time: depart
            };
        } else {
            const arrive = getTodayWithTime(startNode.arrive);
            plus9hours(arrive);
            stations[s++] = {
                startDatetime: arrive, endDatetime: startDatetime,
                info: `현재역: ${startNode.name}`
            };
        }

        stations[s++] = {
            startDatetime, endDatetime,
            info: `전역: ${startNode.name}, 다음역: ${endNode.name}`
        };

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

        // 변위 구하기
        const getDisplacement = (sec) => { // return km
            if (0 <= sec && sec < accElapsedSec) {
                return 0.5 * accVelocityInSec * (sec * sec); //km
            } else if (accElapsedSec <= sec && sec <= totalElapsedSec - accElapsedSec) {
                return ((velocityInSec * accElapsedSec) / 2) + (velocityInSec * (sec - accElapsedSec));
            } else if (totalElapsedSec - accElapsedSec < sec && sec <= totalElapsedSec) {
                const _sec = totalElapsedSec - sec;
                return totalDistance - 0.5 * accVelocityInSec * (_sec * _sec);
            }
        };

        const accUpEndDisplacement = getDisplacement(accElapsedSec);
        const accDownStartDisplacement = getDisplacement(totalElapsedSec - accElapsedSec);

        const getTakenSec = (displacement) => {
            if (displacement < accUpEndDisplacement) {
                return Math.sqrt((2 * displacement) / accVelocityInSec);
            } else if (accUpEndDisplacement <= displacement && displacement < accDownStartDisplacement) {
                return (displacement - accUpEndDisplacement) / velocityInSec + accElapsedSec;
            } else if (accDownStartDisplacement <= displacement && displacement <= totalDistance) {
                const _displacement = totalDistance - displacement;
                return totalElapsedSec - Math.sqrt((2 * _displacement) / accVelocityInSec);
            }
        };

        // - 1 구간 구하기
        for (let sec = 0; sec < accElapsedSec; sec += sampleUnitSec) {
            const time = new Date(startDatetime.getTime() + sec * 1000);
            const displacement = getDisplacement(sec);
            const location = Turf.getCoord(Turf.along(feature, displacement, options));
            positions[p++] = {
                time,
                location,
            };
        }

        // - 2 구간 구하기
        const noAccFeature = Turf.lineSliceAlong(feature, accUpEndDisplacement, accDownStartDisplacement, options);
        const wholeVertexList = Turf.getCoords(feature);
        const vertexList = Turf.getCoords(noAccFeature);

        for (let i = 0; i < vertexList.length; i++) {
            const vertex = vertexList[i];
            const _displacement = Turf.length(Turf.lineSlice(wholeVertexList[0], vertex, feature), options);

            const time = new Date(startDatetime.getTime() + getTakenSec(_displacement) * 1000);
            positions[p++] = {
                time,
                location: vertex,
            };
        }

        // - 3 구간 구하기
        for (let sec = accElapsedSec + noAccElapsedSec; sec < totalElapsedSec; sec += sampleUnitSec) {
            const time = new Date(startDatetime.getTime() + sec * 1000);
            const displacement = getDisplacement(sec);
            const location = Turf.getCoord(Turf.along(feature, displacement, options));
            positions[p++] = {
                time,
                location,
            };
        }

        // -4 각도 구하기
        let lastAngle = 0;
        for (let v = 0; v < wholeVertexList.length -1 ; v++) {
            const vertex = wholeVertexList[v];
            const nextVertex = wholeVertexList[v + 1];
            lastAngle = Turf.bearing(vertex, nextVertex);
            const displacement = Turf.length(Turf.lineSlice(wholeVertexList[0], vertex, feature), options);
            const nextDisplacement = Turf.length(Turf.lineSlice(wholeVertexList[0], nextVertex, feature), options);

            angles[a++] = {
                startDatetime: new Date(startDatetime.getTime() + getTakenSec(displacement) * 1000),
                endDatetime: new Date(startDatetime.getTime() + getTakenSec(nextDisplacement) * 1000),
                angle: lastAngle,
            };
        }

        if (timetable[index + 2]) {
            const endNodeDepartDatetime = getTodayWithTime(timetable[index + 1].depart);
            plus9hours(endNodeDepartDatetime);

            angles[a++] = {
                startDatetime: endDatetime,
                endDatetime: endNodeDepartDatetime,
                angle: lastAngle,
            };
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
