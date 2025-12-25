import { useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import styled from 'styled-components';
import { Alert, Skeleton } from 'antd';
import { Props as AnswerResultProps } from '@/components/pages/home/promptThread/AnswerResult';
import { usePreviewDataMutation } from '@/apollo/client/graphql/home.generated';

const MapView = dynamic(() => import('@/components/map'), {
  ssr: false,
  loading: () => <StyledSkeleton active paragraph={{ rows: 6 }} title={false} />,
});

const StyledSkeleton = styled(Skeleton)`
  padding: 16px;
  .ant-skeleton-paragraph {
    margin-bottom: 0;
  }
`;

const MapWrapper = styled.div`
  padding: 16px;
  
  .map-description {
    margin-bottom: 16px;
    color: var(--gray-8);
  }
`;

// Helper function to check if data contains geometry columns
const hasGeometryData = (columns: { name: string; type: string }[]): boolean => {
  if (!columns) return false;
  return columns.some(
    (col) =>
      col.type?.toUpperCase() === 'GEOMETRY' ||
      col.type?.toUpperCase() === 'GEOGRAPHY' ||
      col.name?.toLowerCase().includes('geojson') ||
      col.name?.toLowerCase().includes('geometry') ||
      col.name?.toLowerCase().includes('geom')
  );
};

// Helper function to check if data contains lat/long columns
const hasLatLongData = (columns: { name: string; type: string }[]): boolean => {
  if (!columns) return false;
  const colNames = columns.map((col) => col.name?.toLowerCase());
  const hasLat = colNames.some((name) => 
    name === 'lat' || name === 'latitude' || name === 'y' || name?.includes('lat')
  );
  const hasLong = colNames.some((name) => 
    name === 'long' || name === 'lng' || name === 'longitude' || name === 'x' || name?.includes('lon')
  );
  return hasLat && hasLong;
};

// Helper function to check if data can be displayed on a map
const canDisplayOnMap = (columns: { name: string; type: string }[]): boolean => {
  return hasGeometryData(columns) || hasLatLongData(columns);
};

export default function MapAnswer(props: AnswerResultProps) {
  const { threadResponse } = props;

  const [previewData, previewDataResult] = usePreviewDataMutation({
    onError: (error) => console.error(error),
  });

  // Initial trigger when render
  useEffect(() => {
    previewData({
      variables: { where: { responseId: threadResponse.id } },
    });
  }, [threadResponse.id]);

  const { data, columns, canShowMap, hasLatLong } = useMemo(() => {
    const previewResult = previewDataResult.data?.previewData;
    const cols = previewResult?.columns || [];
    const dataRows = previewResult?.data || [];
    
    return {
      data: dataRows,
      columns: cols,
      canShowMap: canDisplayOnMap(cols),
      hasLatLong: hasLatLongData(cols),
    };
  }, [previewDataResult.data]);

  const loading = previewDataResult.loading;

  if (loading) {
    return (
      <StyledSkeleton
        active
        paragraph={{ rows: 6 }}
        title={false}
      />
    );
  }

  if (!canShowMap) {
    return (
      <MapWrapper>
        <Alert
          type="info"
          message="No Map Data Available"
          description={
            <div>
              <p>The query results do not contain any geometry data that can be displayed on a map.</p>
            </div>
          }
          showIcon
        />
      </MapWrapper>
    );
  }

  if (data.length === 0) {
    return (
      <MapWrapper>
        <Alert
          type="warning"
          message="No Data"
          description="The query returned no results to display on the map."
          showIcon
        />
      </MapWrapper>
    );
  }

  return (
    <MapWrapper>
      <div className="map-description">
        Displaying {data.length} location{data.length !== 1 ? 's' : ''} on the map.
        Click on markers to view details.
      </div>
      <MapView
        data={data}
        columns={columns}
        width="100%"
        height={450}
      />
    </MapWrapper>
  );
}
