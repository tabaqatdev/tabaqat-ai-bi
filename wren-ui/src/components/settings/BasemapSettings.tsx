import { useState, useEffect } from 'react';
import { Form, Select, Button, Card, Space, message, Input, Modal, Tooltip } from 'antd';
import styled from 'styled-components';
import UpOutlined from '@ant-design/icons/UpOutlined';
import DownOutlined from '@ant-design/icons/DownOutlined';
import EditOutlined from '@ant-design/icons/EditOutlined';
import DeleteOutlined from '@ant-design/icons/DeleteOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';

const StyledCard = styled(Card)`
  margin-bottom: 16px;
  
  .ant-card-body {
    padding: 16px;
  }
`;

const BasemapItem = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  background: white;
  border: 1px solid #d9d9d9;
  border-radius: 4px;
`;

const BasemapName = styled.div`
  flex: 1;
  font-weight: 500;
`;

interface BasemapConfig {
  id: string;
  name: string;
  tiles: string[];
  attribution: string;
  isCustom?: boolean;
}

const DEFAULT_BASEMAPS: BasemapConfig[] = [
  {
    id: 'osm',
    name: 'OpenStreetMap',
    tiles: [
      'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
      'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
    ],
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  {
    id: 'satellite',
    name: 'Satellite',
    tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
    attribution: '&copy; Esri, Maxar, Earthstar Geographics',
  },
  {
    id: 'dark',
    name: 'Dark',
    tiles: [
      'https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
      'https://cartodb-basemaps-b.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
      'https://cartodb-basemaps-c.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png',
    ],
    attribution: '&copy; CARTO, OpenStreetMap contributors',
  },
  {
    id: 'light',
    name: 'Light',
    tiles: [
      'https://cartodb-basemaps-a.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
      'https://cartodb-basemaps-b.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
      'https://cartodb-basemaps-c.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png',
    ],
    attribution: '&copy; CARTO, OpenStreetMap contributors',
  },
];

export default function BasemapSettings() {
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();
  const [basemaps, setBasemaps] = useState<BasemapConfig[]>([]);
  const [basemapOrder, setBasemapOrder] = useState<string[]>([]);
  const [defaultBasemap, setDefaultBasemap] = useState<string>('osm');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingBasemap, setEditingBasemap] = useState<BasemapConfig | null>(null);

  useEffect(() => {
    // Load saved settings from localStorage
    const savedBasemaps = localStorage.getItem('basemaps');
    const savedOrder = localStorage.getItem('basemapOrder');
    const savedDefault = localStorage.getItem('defaultBasemap');
    
    if (savedBasemaps) {
      setBasemaps(JSON.parse(savedBasemaps));
    } else {
      setBasemaps(DEFAULT_BASEMAPS);
      localStorage.setItem('basemaps', JSON.stringify(DEFAULT_BASEMAPS));
    }
    
    if (savedOrder) {
      setBasemapOrder(JSON.parse(savedOrder));
    } else {
      const defaultOrder = DEFAULT_BASEMAPS.map(b => b.id);
      setBasemapOrder(defaultOrder);
      localStorage.setItem('basemapOrder', JSON.stringify(defaultOrder));
    }
    
    if (savedDefault) {
      setDefaultBasemap(savedDefault);
      form.setFieldsValue({ defaultBasemap: savedDefault });
    } else {
      form.setFieldsValue({ defaultBasemap: 'osm' });
    }
  }, []);

  const saveToLocalStorage = (newBasemaps: BasemapConfig[], newOrder: string[], newDefault: string) => {
    localStorage.setItem('basemaps', JSON.stringify(newBasemaps));
    localStorage.setItem('basemapOrder', JSON.stringify(newOrder));
    localStorage.setItem('defaultBasemap', newDefault);
  };

  const moveBasemap = (index: number, direction: 'up' | 'down') => {
    const newOrder = [...basemapOrder];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newOrder.length) return;
    
    [newOrder[index], newOrder[targetIndex]] = [newOrder[targetIndex], newOrder[index]];
    setBasemapOrder(newOrder);
  };

  const handleAddBasemap = () => {
    setEditingBasemap(null);
    editForm.resetFields();
    setIsModalVisible(true);
  };

  const handleEditBasemap = (basemap: BasemapConfig) => {
    setEditingBasemap(basemap);
    editForm.setFieldsValue({
      name: basemap.name,
      tiles: basemap.tiles.join('\n'),
      attribution: basemap.attribution,
    });
    setIsModalVisible(true);
  };

  const handleDeleteBasemap = (basemapId: string) => {
    Modal.confirm({
      title: 'Delete Basemap',
      content: 'Are you sure you want to delete this basemap?',
      onOk: () => {
        const newBasemaps = basemaps.filter(b => b.id !== basemapId);
        const newOrder = basemapOrder.filter(id => id !== basemapId);
        let newDefault = defaultBasemap;
        
        if (defaultBasemap === basemapId && newBasemaps.length > 0) {
          newDefault = newBasemaps[0].id;
          form.setFieldsValue({ defaultBasemap: newDefault });
        }
        
        setBasemaps(newBasemaps);
        setBasemapOrder(newOrder);
        setDefaultBasemap(newDefault);
        saveToLocalStorage(newBasemaps, newOrder, newDefault);
        message.success('Basemap deleted successfully');
      },
    });
  };

  const handleModalOk = async () => {
    try {
      const values = await editForm.validateFields();
      const tiles = values.tiles.split('\n').map((t: string) => t.trim()).filter(Boolean);
      
      if (tiles.length === 0) {
        message.error('Please provide at least one tile URL');
        return;
      }

      let newBasemaps: BasemapConfig[];
      let newOrder: string[];

      if (editingBasemap) {
        // Edit existing basemap
        newBasemaps = basemaps.map(b => 
          b.id === editingBasemap.id 
            ? { ...b, name: values.name, tiles, attribution: values.attribution }
            : b
        );
        newOrder = basemapOrder;
      } else {
        // Add new basemap
        const newId = `custom_${Date.now()}`;
        const newBasemap: BasemapConfig = {
          id: newId,
          name: values.name,
          tiles,
          attribution: values.attribution,
          isCustom: true,
        };
        newBasemaps = [...basemaps, newBasemap];
        newOrder = [...basemapOrder, newId];
      }

      setBasemaps(newBasemaps);
      setBasemapOrder(newOrder);
      saveToLocalStorage(newBasemaps, newOrder, defaultBasemap);
      setIsModalVisible(false);
      message.success(editingBasemap ? 'Basemap updated successfully' : 'Basemap added successfully');
    } catch (error) {
      console.error('Validation failed:', error);
    }
  };

  const handleSave = () => {
    const values = form.getFieldsValue();
    saveToLocalStorage(basemaps, basemapOrder, values.defaultBasemap);
    setDefaultBasemap(values.defaultBasemap);
    message.success('Basemap settings saved successfully');
  };

  const handleReset = () => {
    const defaultOrder = DEFAULT_BASEMAPS.map(b => b.id);
    const defaultBase = 'osm';
    
    setBasemaps(DEFAULT_BASEMAPS);
    setBasemapOrder(defaultOrder);
    setDefaultBasemap(defaultBase);
    form.setFieldsValue({ defaultBasemap: defaultBase });
    saveToLocalStorage(DEFAULT_BASEMAPS, defaultOrder, defaultBase);
    message.success('Basemap settings reset to defaults');
  };

  const basemapOptions = basemaps.map(b => ({ value: b.id, label: b.name }));

  return (
    <div className="p-4">
      <Form form={form} layout="vertical">
        <StyledCard 
          title="Default Basemap"
          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={handleAddBasemap}>
              Add Basemap
            </Button>
          }
        >
          <Form.Item
            name="defaultBasemap"
            label="Select the default basemap to display when maps are loaded"
            rules={[{ required: true, message: 'Please select a default basemap' }]}
          >
            <Select
              options={basemapOptions}
              placeholder="Select default basemap"
              onChange={(value) => setDefaultBasemap(value)}
            />
          </Form.Item>
        </StyledCard>

        <StyledCard title="Manage Basemaps">
          <div className="mb-3 text-sm gray-7">
            Use the arrow buttons to reorder basemaps. The order will be reflected in the basemap switcher on maps.
          </div>
          {basemapOrder.map((basemapId, index) => {
            const basemap = basemaps.find(b => b.id === basemapId);
            if (!basemap) return null;
            
            return (
              <BasemapItem key={basemapId}>
                <BasemapName>
                  {basemap.name}
                  {basemap.isCustom && (
                    <span className="text-xs gray-6 ml-2">(Custom)</span>
                  )}
                </BasemapName>
                {defaultBasemap === basemapId && (
                  <span className="text-xs bg-blue-1 text-blue-6 px-2 py-1 rounded">
                    Default
                  </span>
                )}
                <Space>
                  <Tooltip title="Move up">
                    <Button
                      size="small"
                      icon={<UpOutlined />}
                      disabled={index === 0}
                      onClick={() => moveBasemap(index, 'up')}
                    />
                  </Tooltip>
                  <Tooltip title="Move down">
                    <Button
                      size="small"
                      icon={<DownOutlined />}
                      disabled={index === basemapOrder.length - 1}
                      onClick={() => moveBasemap(index, 'down')}
                    />
                  </Tooltip>
                  <Tooltip title="Edit basemap">
                    <Button
                      size="small"
                      icon={<EditOutlined />}
                      onClick={() => handleEditBasemap(basemap)}
                    />
                  </Tooltip>
                  <Tooltip title="Delete basemap">
                    <Button
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => handleDeleteBasemap(basemapId)}
                    />
                  </Tooltip>
                </Space>
              </BasemapItem>
            );
          })}
        </StyledCard>

        <Space>
          <Button type="primary" onClick={handleSave}>
            Save Settings
          </Button>
          <Button onClick={handleReset}>
            Reset to Defaults
          </Button>
        </Space>
      </Form>

      <Modal
        title={editingBasemap ? 'Edit Basemap' : 'Add New Basemap'}
        visible={isModalVisible}
        onOk={handleModalOk}
        onCancel={() => setIsModalVisible(false)}
        width={600}
      >
        <Form form={editForm} layout="vertical">
          <Form.Item
            name="name"
            label="Basemap Name"
            rules={[{ required: true, message: 'Please enter basemap name' }]}
          >
            <Input placeholder="e.g., My Custom Basemap" />
          </Form.Item>
          
          <Form.Item
            name="tiles"
            label="Tile URLs (one per line)"
            rules={[{ required: true, message: 'Please enter at least one tile URL' }]}
            extra="Use {z}, {x}, {y} placeholders for zoom, x, and y coordinates"
          >
            <Input.TextArea
              rows={4}
              placeholder="https://tile.example.com/{z}/{x}/{y}.png"
            />
          </Form.Item>
          
          <Form.Item
            name="attribution"
            label="Attribution"
            rules={[{ required: true, message: 'Please enter attribution text' }]}
          >
            <Input placeholder="&copy; Map Provider" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
