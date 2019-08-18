function Person(name, foods) {
    this.name = name;
    this.foods = foods;
};

Person.prototype.fetchFavFoods = function () {
    return new Promise((resolve, reject) => {
        // Simulate an API
        setTimeout(() => resolve(this.foods), 2000);
    });
};


describe('Mocking learning', () => {
    it('Mocks a reg functions', () => {
        const fetchDogs = jest.fn();
        fetchDogs('snickers');
        expect(fetchDogs).toHaveBeenCalled();
        expect(fetchDogs).toHaveBeenCalledWith('snickers');
        fetchDogs('hugo');
        expect(fetchDogs).toHaveBeenCalledTimes(2);
    });

    it('Can create a person', () => {
        const me = new Person('Connor', ['Pizza', 'Tacos']);
        expect(me.name).toEqual('Connor');
    });

    it('Can fetch foods', async () => {
        const me = new Person('Connor', ['Pizza', 'Tacos']);
        // Mock the favFoods function
        me.fetchFavFoods = jest.fn().mockResolvedValue(['Sushi', 'Ramen']);
        const favFoods = await me.fetchFavFoods();
        expect(favFoods).toContain('Ramen');
    });
});