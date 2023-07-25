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
        const totalDistance = Turf.length(feature, options) ; // km

        const noAccElapsedSec = totalElapsedSec - 2 * accElapsedSec;

        //속도 구하기
        const velocity = (totalDistance * 2 )/ ((totalElapsedSec + noAccElapsedSec)/3600) //km/h
        const accVelocity = velocity / ( accElapsedSec / 3600); // km/h^2

        const velocityInSec = velocity / 3600; // km/s
        const accVelocityInSec = velocityInSec / accElapsedSec; // km/s^2

        // 변위 구하기
        const getDisplacement = (sec) => { // return km
            if( 0 <= sec  && sec < accElapsedSec ) {
                return  0.5 * accVelocityInSec * (sec * sec); //km
            }else if( accElapsedSec <= sec  && sec <= totalElapsedSec - accElapsedSec ) {
                return ((velocityInSec * accElapsedSec) / 2) + (velocityInSec * (sec - accElapsedSec));
            }else if( totalElapsedSec - accElapsedSec < sec && sec <= totalElapsedSec ) {
                const _sec = totalElapsedSec - sec;
                return totalDistance - 0.5 * accVelocityInSec * (_sec * _sec)
            }
        }

        const accUpEndDisplacement = getDisplacement(accElapsedSec);
        const accDownStartDisplacement = getDisplacement(totalElapsedSec - accElapsedSec);

        const getTakenSec = (displacement) => {
            if( displacement < accUpEndDisplacement ) {
                return Math.sqrt((2 * displacement) / accVelocityInSec);
            }else if( accUpEndDisplacement <= displacement && displacement < accDownStartDisplacement ) {
                return  (displacement - accUpEndDisplacement) / velocityInSec + accElapsedSec;
            }else if ( accDownStartDisplacement <= displacement && displacement <= totalDistance ) {
                const _displacement = totalDistance - displacement;
                return totalElapsedSec - Math.sqrt((2 * _displacement) / accVelocityInSec)
            }
        }

        // - 1 구간 구하기
        for(let sec= 0; sec < accElapsedSec; sec += sampleUnitSec) {
            const time = new Date(startDatetime.getTime() + sec * 1000);
            const displacement = getDisplacement(sec);
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

        for (let i = 0; i < vertexList.length; i++) {
            const vertex = vertexList[i];
            const _displacement = Turf.length(Turf.lineSlice(wholeVertexList[0], vertex, feature), options);

            const time = new Date(startDatetime.getTime() + getTakenSec(_displacement) * 1000);
            positions.push({
                time,
                location: vertex,
            });
        }

        // - 3 구간 구하기
        for(let sec = accElapsedSec + noAccElapsedSec; sec < totalElapsedSec; sec +=sampleUnitSec ){ // TODO <= 이건지 < 이건지..
            const time = new Date(startDatetime.getTime() + sec * 1000);
            const displacement = getDisplacement(sec);
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

    for(let train of trains) {
        if(railways && line) {
            const entity = makeTrainEntity(line, train, railways);
            if(entity) entities.push(entity)
        }
    }

    // 결과물을 메인 스레드로 보냄
    postMessage(entities); //TODO
};
