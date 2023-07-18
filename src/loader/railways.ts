
import * as Cesium from 'cesium';
// @ts-ignore
import {Cartesian3, Entity, Viewer, JulianDate} from '@types/cesium';
import trainColor from "../data/trainColor";

export default (viewer: Viewer) => {

    [
        {   "line": "line1",
            "file":'../dataTmp/railway_1.geojson'
        },
        {   "line": "line2",
            "file":'../dataTmp/railway_2.geojson'
        },
        {   "line": "line3",
            "file":'../dataTmp/railway_3.geojson'
        },
        {   "line": "line7",
            "file":'../dataTmp/railway_7.geojson'
        }
    ]
        .forEach((railway) => {
            const color = Cesium.Color.fromCssColorString(trainColor[railway.line]).withAlpha(0.5);
            viewer.dataSources.add(Cesium.GeoJsonDataSource.load(railway.file, {
                stroke: color,
                fill: color,
                strokeWidth: 4,
                clampToGround: true,
            }));
    });


}
