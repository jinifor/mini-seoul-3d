import React, { useMemo, useEffect, useState } from "react";

import * as Cesium from 'cesium'

import Card from '@mui/joy/Card';
import Typography from '@mui/joy/Typography';

import useTrainStore from "../../store/useTrainStore";

import map from '../../map'

const TrainInfoBox = () => {

    const { entity } = useTrainStore();
    const [count, setCount] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCount(prevCount => prevCount + 1);
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const stationInfo = useMemo(() => {
        if(entity) {
            const now = Cesium.JulianDate.toDate(map.getCurrentTime()); //TODO
            // @ts-ignore
            return entity?.station.getValue(now);
        }
    }, [count]);

    return <>
        {entity && stationInfo ?
            <Card variant="outlined" sx={{
                background: 'rgba(255, 255, 255, 0.5)',
                width: 180, mt: 1
            }}>
                <Typography level="h2" sx={{ fontSize: 'sm' }}>
                    {entity ? entity.id : '정보'}
                </Typography>
                <Typography level="body2" sx={{ mt: 0.5, mb: 1 }}>
                    {
                        entity ?
                            // @ts-ignore
                            stationInfo
                            : '정보'
                    }
                </Typography>
            </Card>
        : <></>}
    </>
}

export default TrainInfoBox;
