import { describe, expect, test } from 'vitest'
import { render } from '@testing-library/react'
import { OverlayGForceWidget } from '@/features/widget-preview/widgets/g-force/GForcePreview'
import { prepareGForcePreview } from '@/features/widget-preview/widgets/g-force/model'

function makeWidget() {
  return {
    id: 'g-force-test',
    type: 'g_force',
    category: 'values',
    data: {
      display_type: 'g_force',
      x: 0,
      y: 0,
      width: 220,
      height: 220,
      rotation: 0,
      opacity: 1,
      diameter: 200,
      fill_color: '#212121',
      fill_opacity: 0.5,
      border_thickness: 2,
      border_color: '#ffffff',
      border_opacity: 1,
      marker_size: 12,
      marker_color: '#40e0d0',
      marker_opacity: 0.8,
      axis_horizontal: 'x',
      axis_vertical: 'y',
      invert_horizontal: false,
      invert_vertical: false,
      clip_percentile: 80,
      label_font: 'Arial.ttf',
      label_font_size: 14,
      label_color: '#ffffff',
      label_decimals: 1,
      label_unit: 'G',
      label_unit_color: '#40e0d0',
      label_offset_x: 0,
      label_offset_y: 0,
    },
  }
}

const ACTIVITY = {
  sample_elapsed_seconds: [0, 1, 2, 3, 4, 5],
  g_force_x: [0, 3, 0, null, 8, 0],
  g_force_y: [0, 4, 2, 1, 6, 0],
  g_force_z: [1, 2, 12, null, 0, -5],
}

describe('OverlayGForceWidget', () => {
  test('renders the configured envelope and current interpolated sample', () => {
    const { getByTestId } = render(
      <OverlayGForceWidget widget={makeWidget()} activity={ACTIVITY} previewSecond={0.5} globalOpacity={1} globalScale={1} sceneStyle={{}} />,
    )

    expect(getByTestId('g-force-border')).toHaveAttribute('r', '99')
    expect(getByTestId('g-force-border')).toHaveAttribute('fill', 'none')
    expect(getByTestId('g-force-border')).toHaveAttribute('stroke', '#ffffff')
    expect(getByTestId('g-force-border')).toHaveAttribute('stroke-width', '2')
    expect(getByTestId('g-force-parent-circle')).toHaveAttribute('r', '98')
    expect(getByTestId('g-force-parent-circle')).toHaveAttribute('fill', '#212121')
    expect(getByTestId('g-force-marker')).toHaveAttribute('cx', '140')
    expect(getByTestId('g-force-marker')).toHaveAttribute('cy', '150')
    expect(getByTestId('g-force-label')).toHaveTextContent('2.5 G')
    expect(getByTestId('g-force-unit')).toHaveTextContent('G')
    expect(getByTestId('g-force-coordinates')).toHaveTextContent('[1.5, 2.0]')
    expect(getByTestId('g-force-components')).toHaveTextContent('X 1.5 Y 2.0 Z 1.5')
  })

  test('does not apply the scene shadow to the marker', () => {
    const { container } = render(
      <OverlayGForceWidget
        widget={makeWidget()}
        activity={ACTIVITY}
        previewSecond={0.5}
        globalOpacity={1}
        globalScale={1}
        sceneStyle={{ shadow_color: '#000000', shadow_strength: 4, shadow_distance: 2 }}
      />,
    )

    expect(container.querySelectorAll('circle[cx="140"][cy="150"][r="6"]')).toHaveLength(1)
  })

  test('centres the marker and shows the missing label without component series', () => {
    const { getByTestId, queryByTestId } = render(
      <OverlayGForceWidget
        widget={makeWidget()}
        activity={{ sample_elapsed_seconds: [0, 1] }}
        previewSecond={0.5}
        globalOpacity={1}
        globalScale={1}
        sceneStyle={{}}
      />,
    )

    expect(getByTestId('g-force-marker')).toHaveAttribute('cx', '110')
    expect(getByTestId('g-force-marker')).toHaveAttribute('cy', '110')
    expect(getByTestId('g-force-label')).toHaveTextContent('--')
    expect(getByTestId('g-force-coordinates')).toHaveTextContent('[--, --]')
    expect(getByTestId('g-force-components')).toHaveTextContent('X -- Y -- Z --')
    expect(queryByTestId('g-force-unit')).toBeNull()
  })

  test('distinguishes a valid zero sample from missing data', () => {
    const { getByTestId } = render(
      <OverlayGForceWidget widget={makeWidget()} activity={ACTIVITY} previewSecond={0} globalOpacity={1} globalScale={1} sceneStyle={{}} />,
    )

    expect(getByTestId('g-force-marker')).toHaveAttribute('cx', '110')
    expect(getByTestId('g-force-marker')).toHaveAttribute('cy', '110')
    expect(getByTestId('g-force-label')).toHaveTextContent('0.0 G')
  })

  test('flips the marker horizontally when the selected axis is inverted', () => {
    const baseline = render(
      <OverlayGForceWidget widget={makeWidget()} activity={ACTIVITY} previewSecond={0.5} globalOpacity={1} globalScale={1} sceneStyle={{}} />,
    )
    const baselineX = baseline.getByTestId('g-force-marker').getAttribute('cx')
    baseline.unmount()

    const invertedWidget = makeWidget()
    invertedWidget.data.invert_horizontal = true
    const inverted = render(
      <OverlayGForceWidget widget={invertedWidget} activity={ACTIVITY} previewSecond={0.5} globalOpacity={1} globalScale={1} sceneStyle={{}} />,
    )

    expect(baselineX).toBe('140')
    expect(inverted.getByTestId('g-force-marker')).toHaveAttribute('cx', '80')
    expect(inverted.getByTestId('g-force-coordinates')).toHaveTextContent('[-1.5, 2.0]')
    expect(inverted.getByTestId('g-force-components')).toHaveTextContent('X 1.5 Y 2.0 Z 1.5')
  })

  test('rebuilds the scale and marker position when the horizontal axis is remapped', () => {
    const remappedWidget = makeWidget()
    remappedWidget.data.axis_horizontal = 'z'
    const { getByTestId } = render(
      <OverlayGForceWidget widget={remappedWidget} activity={ACTIVITY} previewSecond={0.5} globalOpacity={1} globalScale={1} sceneStyle={{}} />,
    )

    expect(prepareGForcePreview(ACTIVITY, remappedWidget.data).maxG).toBe(6)
    expect(getByTestId('g-force-marker')).toHaveAttribute('cx', '135')
    expect(getByTestId('g-force-coordinates')).toHaveTextContent('[1.5, 2.0]')
  })
})
