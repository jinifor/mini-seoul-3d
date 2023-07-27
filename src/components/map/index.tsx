import React, { useEffect } from 'react';

import * as Cesium from 'cesium';
import map from '../../map';
import loader from '../../loader';
import useTrainStore from "../../store/useTrainStore";
import useCameraStore from "../../store/useCameraStore";

const mapId = 'cesiumContainer';
const Map = () => {

    const { setEntity, removeEntity } = useTrainStore();
    const { mode, setCameraEntity, setBearing, removeCameraEntity, removeBearing, setAvailable } = useCameraStore();

     useEffect(() => {
        const viewer = map.getViewer();
        const mapContainer = document.getElementById(mapId);

        if (viewer) {
            viewer.destroy();
        }
        if (mapContainer && mapContainer.hasChildNodes()) {
            mapContainer.firstChild? mapContainer.removeChild(mapContainer.firstChild) : null;
        }
        map.initMap(mapId);
        map.setTrainHoverHandler(true, (entity: Cesium.Entity| null) => {
            entity == null ? removeEntity() : setEntity(entity);
        })
        map.setTrainClickHandler(true, mode, (entity: Cesium.Entity | null, bearing: number | null) => {
            if(entity && bearing)  {
                setEntity(entity);
                setCameraEntity(entity);
                setBearing(bearing);
                map.setTrainHoverHandler(false, () => {});
            }else {
                removeEntity();
                removeCameraEntity();
                removeBearing();
                map.setTrainHoverHandler(true, (entity: Cesium.Entity| null) => {
                    entity == null ? removeEntity() : setEntity(entity);
                })
            }
        })

        // camera tool btn on
        loader(map.getViewer()).then(() => {
            setAvailable(true);
        });

    }, [mapId]);

    return <div id={mapId}/>;
};

export default Map;
