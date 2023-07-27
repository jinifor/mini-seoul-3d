import * as Turf from "@turf/turf";

const accElapsedSec = 5;
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

function makeAngle (line, train, railways) {
    const timetable = train.timetables;
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
            // console.log('railway not found', line,train.trainNo, startNode, endNode);
            continue
        }

        const railwayCoords = railway?.coordinates;

        const startDatetime = getTodayWithTime(startNode.depart);
        const endDatetime = getTodayWithTime(endNode.arrive);
        plus9hours(startDatetime);
        plus9hours(endDatetime);

        // 계산 시작
        const diff = endDatetime.getTime() - startDatetime.getTime();
        const totalElapsedSec = diff / 1000;

        const feature = Turf.lineString(railwayCoords);
        const totalDistance = Turf.length(feature, options); // km

        const noAccElapsedSec = totalElapsedSec - 2 * accElapsedSec;

        //속도 구하기
        const velocity = (totalDistance * 2) / ((totalElapsedSec + noAccElapsedSec) / 3600); //km/h

        const velocityInSec = velocity / 3600; // km/s
        const accVelocityInSec = velocityInSec / accElapsedSec; // km/s^2

        const accUpEndDisplacement = ((velocityInSec * accElapsedSec) / 2);
        const accDownStartDisplacement = totalDistance - accUpEndDisplacement;

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

        const wholeVertexList = Turf.getCoords(feature);

        // -4 각도 구하기
        let lastAngle = 0;
        for (let v = 0; v < wholeVertexList.length -1 ; v++) {
            const vertex = wholeVertexList[v];
            const nextVertex = wholeVertexList[v + 1];
            lastAngle = Turf.bearing(vertex, nextVertex);
            const displacement = Turf.length(Turf.lineSlice(wholeVertexList[0], vertex, feature), options);
            const nextDisplacement = Turf.length(Turf.lineSlice(wholeVertexList[0], nextVertex, feature), options);

            angles.push({
                startDatetime: new Date(startDatetime.getTime() + getTakenSec(displacement) * 1000),
                endDatetime: new Date(startDatetime.getTime() + getTakenSec(nextDisplacement) * 1000),
                angle: lastAngle,
            });
        }

        if (timetable[index + 2]) {
            const endNodeDepartDatetime = getTodayWithTime(timetable[index + 1].depart);
            plus9hours(endNodeDepartDatetime);

            angles.push({
                startDatetime: endDatetime,
                endDatetime: endNodeDepartDatetime,
                angle: lastAngle,
            })
        }
    }

    return {
        trainNo: train.trainNo,
        angles,
    };

}

onmessage = function (event) {
    const { line, trains, railways } = event.data;
    const entities = [];
    for(let i=0; i<trains.length; i++) {
        const train = trains[i];
        if(railways && line) {
            const entity = makeAngle(line, train, railways);
            if(entity) entities.push(entity)
        }
    }
    postMessage(entities);
};
