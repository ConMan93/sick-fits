import { mount } from 'enzyme';
import wait from 'waait';
import toJSON from 'enzyme-to-json';
import RequestReset, { REQUEST_RESET_MUTATION } from '../components/RequestReset';
import { MockedProvider } from 'react-apollo/test-utils';

const mocks = [
    {
        request: {
            query: REQUEST_RESET_MUTATION,
            variables: { email: 'conhof@email.com' },
        },
        result: {
            data: {
                requestReset: { message: 'success', __typename: 'message', },
            },
        },
    },
];

describe('<RequestReset />', () => {
    it('renders and matches snapshot', async () => {
        const wrapper = mount(
            <MockedProvider >
                <RequestReset />
            </MockedProvider>
        );
        const form = wrapper.find('form[data-test="form"]');
        expect(toJSON(form)).toMatchSnapshot();
    });

    xit('calls the mutation', async () => {
        const wrapper = mount(
            <MockedProvider mocks={mocks} >
                <RequestReset />
            </MockedProvider>
        );
        // simulate typing in your email
        wrapper.find('input').simulate('change', { target: { name: 'email', value: 'conhof@email.com' } });
        //submit the form
        wrapper.find('form').simulate('submit');
        await wait();
        wrapper.update();
        await wait();
        // expect(wrapper.find('p[data-test="p"]').text()).toContain('Success! check your email for a reset link!');
        expect(wrapper.find('p').text()).toContain('Success! check your email for a reset link!');
    })
});